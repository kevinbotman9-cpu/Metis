package com.metis.service

import com.metis.canonical.Canonical
import com.metis.canonical.Canonical.Value
import com.metis.engine.DecisionRequest
import java.util.concurrent.ConcurrentHashMap

/**
 * Idempotency, mirroring packages/runtime/src/idempotency/index.ts.
 *
 * The rule has to be identical in both engines, not merely similar: a retry
 * that lands on a different instance must resolve the same way, and the request
 * hash is what decides that. It goes through the same ADR-003 canonicaliser, so
 * the two agree by construction rather than by inspection.
 *
 * Key and hash are separate concerns. The key says "same attempt"; the hash says
 * "same question". Matching both is a retry and gets the original decision.
 * Matching only the key is a caller bug, and answering it quietly would hand
 * them a decision about a different customer while looking successful.
 */
data class IdempotencyRecord(
    val tenantId: String,
    val key: String,
    val requestHash: String,
    val decisionId: String,
    val storedAt: String,
)

sealed interface IdempotencyOutcome {
    data object Fresh : IdempotencyOutcome
    data class Replay(val record: IdempotencyRecord) : IdempotencyOutcome
    data class Conflict(val record: IdempotencyRecord, val attemptedHash: String) : IdempotencyOutcome
}

class IdempotencyConflict(val key: String, val storedHash: String, val attemptedHash: String) :
    RuntimeException(
        "Idempotency key \"$key\" was already used for a different request. " +
            "Stored request hash ${storedHash.take(16)}, this request hashes to " +
            "${attemptedHash.take(16)}. Use a new key, or resend the original request."
    )

object Idempotency {
    /**
     * Everything the decision depends on, and nothing else.
     *
     * `idempotencyKey` is the token being looked up, not part of the question.
     * `correlationId` differs on every call, so including it would make every
     * retry a new request — the failure this exists to prevent. Optionals are
     * normalised to null rather than omitted, so a caller that sends the field
     * as null and one that leaves it out hash identically.
     */
    fun requestHash(r: DecisionRequest): String {
        // Member order is irrelevant: the canonicaliser sorts by UTF-16 code
        // unit, which is the whole reason both engines land on the same bytes.
        val history: Value = r.contactHistory?.let {
            Value.Obj(
                listOf(
                    "channel" to Value.Str(it.channel),
                    "withinPeriod" to Value.Obj(
                        it.withinPeriod.map { (k, v) -> k to (Value.Num(v) as Value) }
                    ),
                )
            )
        } ?: Value.Null

        val consent: Value = r.consent?.let {
            Value.Obj(
                listOf(
                    "marketing" to Value.Bool(it.marketing),
                    "profiling" to Value.Bool(it.profiling),
                    "thirdParty" to Value.Bool(it.thirdParty),
                )
            )
        } ?: Value.Null

        return Canonical.hash(
            Value.Obj(
                listOf(
                    "tenantId" to Value.Str(r.tenantId),
                    "customerId" to Value.Str(r.customerId),
                    "channel" to Value.Str(r.channel),
                    "placement" to Value.Str(r.placement),
                    "occurredAt" to Value.Str(r.occurredAt),
                    "input" to Json.toValue(Json.mapper.valueToTree(r.input)),
                    "contactHistory" to history,
                    "consent" to consent,
                )
            )
        )
    }

    fun classify(existing: IdempotencyRecord?, attemptedHash: String): IdempotencyOutcome = when {
        existing == null -> IdempotencyOutcome.Fresh
        existing.requestHash == attemptedHash -> IdempotencyOutcome.Replay(existing)
        else -> IdempotencyOutcome.Conflict(existing, attemptedHash)
    }
}

/**
 * Process-lifetime, like everything else this service stores. The durable
 * ledger replaces it.
 */
class IdempotencyStore {
    private val records = ConcurrentHashMap<String, IdempotencyRecord>()

    // Length-prefixed rather than joined on a separator: a tenant id containing
    // the separator could otherwise read another tenant's key, and isolation is
    // not a thing to leave to a delimiter.
    private fun id(tenantId: String, key: String) = "${tenantId.length}:$tenantId:$key"

    fun get(tenantId: String, key: String): IdempotencyRecord? = records[id(tenantId, key)]

    /**
     * First write wins, and the winner is returned.
     *
     * Under a race two requests can both classify as Fresh and both execute.
     * Only one decision id can be the answer for that key, and it has to be the
     * one already handed to whoever got there first.
     */
    fun put(record: IdempotencyRecord): IdempotencyRecord =
        records.putIfAbsent(id(record.tenantId, record.key), record) ?: record

    fun clear() = records.clear()

    val size: Int get() = records.size
}
