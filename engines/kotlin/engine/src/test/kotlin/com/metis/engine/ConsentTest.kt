package com.metis.engine

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/**
 * Consent fails closed. G-065, ADR-014 §7.1. The same statements as
 * `packages/runtime/tests/consent.test.ts`; the decision corpus holds the two
 * engines to the same bytes, and these name the rule so a broken one says which.
 */
class ConsentTest {
    @Test
    fun `absent consent is recorded as absent, never granted`() {
        assertEquals(
            ConsentState(ConsentState.ABSENT, ConsentState.ABSENT, ConsentState.ABSENT),
            ConsentState.of(null),
        )
    }

    @Test
    fun `a purpose left out of stated consent is absent, not granted`() {
        assertEquals(
            ConsentState(ConsentState.ABSENT, ConsentState.GRANTED, ConsentState.WITHHELD),
            ConsentState.of(Consent(profiling = true, thirdParty = false)),
        )
    }

    @Test
    fun `only a stated yes permits`() {
        assertTrue(ConsentState.permits(ConsentState.GRANTED))
        assertFalse(ConsentState.permits(ConsentState.WITHHELD))
        assertFalse(ConsentState.permits(ConsentState.ABSENT))
    }

    @Test
    fun `the recorded state turns back into the request that produces it`() {
        assertEquals(
            Consent(marketing = null, profiling = true, thirdParty = false),
            ConsentState(ConsentState.ABSENT, ConsentState.GRANTED, ConsentState.WITHHELD).asAssertion(),
        )
    }
}
