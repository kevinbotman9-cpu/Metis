package com.metis.engine

import com.metis.canonical.Canonical
import com.metis.canonical.Canonical.Value

/**
 * Decision to canonical value.
 *
 * The one place where the port has to agree with the TypeScript object
 * *shape*, not just its behaviour: the same field names, the same nesting, and
 * the same view of what is absent. `sourceBindings` on a decision with no
 * connectors is an empty array, not a missing key, because that is what the
 * TypeScript builds — and an empty array and a missing key hash differently.
 *
 * Written by hand rather than reflected over the data classes. Reflection
 * would make the hash depend on Kotlin's property ordering and on how a future
 * refactor happens to rename a field, which is exactly the coupling ADR-003
 * exists to remove.
 */
object Canon {

    private fun str(s: String) = Value.Str(s)
    private fun num(d: Double) = Value.Num(d)
    private fun strOrNull(s: String?) = s?.let { Value.Str(it) } ?: Value.Null
    private fun arr(items: List<Value>) = Value.Arr(items)
    private fun obj(vararg members: Pair<String, Value>) = Value.Obj(members.toList())

    fun decision(d: DeterministicDecision): Value = obj(
        "tenantId" to str(d.tenantId),
        "artifactId" to str(d.artifactId),
        "artifactVersion" to str(d.artifactVersion),
        "customerRef" to str(d.customerRef),
        "occurredAt" to str(d.occurredAt),
        "channel" to str(d.channel),
        "placement" to str(d.placement),
        "inputSnapshotHash" to str(d.inputSnapshotHash),
        "catalogueSnapshotHash" to str(d.catalogueSnapshotHash),
        "sourceBindings" to arr(d.sourceBindings.map { binding(it) }),
        "packageVersions" to obj(*d.packageVersions.map { (k, v) -> k to str(v) }.toTypedArray()),
        "candidateKeys" to arr(d.candidateKeys.map { str(it) }),
        "eliminations" to arr(d.eliminations.map { elimination(it) }),
        "scores" to obj(*d.scores.map { (k, v) -> k to score(v) }.toTypedArray()),
        "arbitration" to obj(
            "formula" to str(d.arbitration.formula),
            "winner" to strOrNull(d.arbitration.winner),
            "runnerUp" to strOrNull(d.arbitration.runnerUp),
        ),
        "constraintsApplied" to arr(d.constraintsApplied.map { str(it) }),
        "consentState" to obj(
            "marketing" to Value.Bool(d.consentState.marketing),
            "profiling" to Value.Bool(d.consentState.profiling),
            "thirdParty" to Value.Bool(d.consentState.thirdParty),
        ),
        "winner" to strOrNull(d.winner),
        "winnerPropositionId" to strOrNull(d.winnerPropositionId),
    )

    private fun binding(b: SourceBinding): Value = obj(
        "field" to str(b.field),
        "connectorId" to str(b.connectorId),
        "nodeId" to str(b.nodeId),
    )

    private fun elimination(e: EliminationStep): Value = obj(
        "nodeId" to str(e.nodeId),
        "nodeType" to str(e.nodeType),
        "reason" to str(e.reason),
        "eliminated" to arr(e.eliminated.map { str(it) }),
        "survived" to arr(e.survived.map { str(it) }),
    )

    private fun score(s: CandidateScore): Value = obj(
        "propensity" to num(s.propensity),
        "value" to num(s.value),
        "lever" to num(s.lever),
        "context" to num(s.context),
        "priority" to num(s.priority),
    )

    /** SHA-256 of the canonical form. */
    fun hash(d: DeterministicDecision): String = Canonical.hash(decision(d))
}
