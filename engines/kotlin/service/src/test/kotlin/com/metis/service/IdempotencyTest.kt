package com.metis.service

import com.metis.engine.Consent
import com.metis.engine.ContactHistory
import com.metis.engine.DecisionRequest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The rule, held to the same statements as the TypeScript side.
 *
 * The request hash itself is checked against the TypeScript by the service
 * conformance corpus; these cover the behaviour around it, which is where the
 * two could still drift apart without the hashes ever disagreeing.
 */
class IdempotencyTest {
    private val base = DecisionRequest(
        tenantId = "telco-uk",
        customerId = "cust_1",
        channel = "email",
        placement = "weekly_offers",
        occurredAt = "2026-06-01T12:00:00.000Z",
        input = mapOf("age" to 41.0, "tenureMonths" to 30.0),
        consent = Consent(marketing = true, profiling = true, thirdParty = false),
    )

    @Test
    fun `the key is not part of the question`() {
        assertEquals(
            Idempotency.requestHash(base),
            Idempotency.requestHash(base.copy(idempotencyKey = "k1")),
        )
    }

    @Test
    fun `the correlation id is not part of the question`() {
        // It differs on every retry. Including it would make every retry a new
        // request, which is the failure idempotency exists to prevent.
        assertEquals(
            Idempotency.requestHash(base.copy(correlationId = "trace-a")),
            Idempotency.requestHash(base.copy(correlationId = "trace-b")),
        )
    }

    @Test
    fun `input key order does not change the question`() {
        assertEquals(
            Idempotency.requestHash(base),
            Idempotency.requestHash(
                base.copy(input = mapOf("tenureMonths" to 30.0, "age" to 41.0))
            ),
        )
    }

    @Test
    fun `anything the decision depends on changes the question`() {
        val original = Idempotency.requestHash(base)
        listOf(
            base.copy(customerId = "cust_2"),
            base.copy(channel = "sms"),
            base.copy(placement = "app_inbox"),
            base.copy(occurredAt = "2026-06-01T12:00:01.000Z"),
            base.copy(input = mapOf("age" to 42.0, "tenureMonths" to 30.0)),
            base.copy(consent = Consent(marketing = false, profiling = true, thirdParty = false)),
            base.copy(contactHistory = ContactHistory("email", mapOf("month" to 1.0))),
            base.copy(tenantId = "telco-ie"),
        ).forEach { assertNotEquals(original, Idempotency.requestHash(it)) }
    }

    @Test
    fun `classify separates a retry from a reused key`() {
        val stored = IdempotencyRecord("telco-uk", "k1", "aaaa", "dec_1", "2026-06-01T12:00:00Z")
        assertTrue(Idempotency.classify(null, "aaaa") is IdempotencyOutcome.Fresh)
        assertTrue(Idempotency.classify(stored, "aaaa") is IdempotencyOutcome.Replay)
        assertTrue(Idempotency.classify(stored, "bbbb") is IdempotencyOutcome.Conflict)
    }

    @Test
    fun `keys are scoped per tenant`() {
        val s = IdempotencyStore()
        s.put(IdempotencyRecord("a", "k1", "h", "dec_a", "t"))
        s.put(IdempotencyRecord("b", "k1", "h", "dec_b", "t"))
        assertEquals("dec_a", s.get("a", "k1")?.decisionId)
        assertEquals("dec_b", s.get("b", "k1")?.decisionId)
    }

    @Test
    fun `a tenant id containing the separator cannot read another tenant`() {
        val s = IdempotencyStore()
        s.put(IdempotencyRecord("a:b", "c", "h", "dec_1", "t"))
        assertNull(s.get("a", "b:c"))
        assertEquals("dec_1", s.get("a:b", "c")?.decisionId)
    }

    @Test
    fun `the first write wins and the loser is told`() {
        // Under a race two requests can both be Fresh and both execute. Only
        // one id can be the answer, and it is the one already returned.
        val s = IdempotencyStore()
        val first = s.put(IdempotencyRecord("t", "k", "h", "dec_first", "t"))
        val second = s.put(IdempotencyRecord("t", "k", "h", "dec_second", "t"))
        assertEquals("dec_first", first.decisionId)
        assertEquals("dec_first", second.decisionId)
        assertEquals(1, s.size)
    }
}
