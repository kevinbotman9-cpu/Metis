package com.metis.service

import com.metis.engine.ConsentState
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * What the service reads off the wire. Until 2026-09-13 a consent object that
 * left out `marketing` was read as marketing granted — the same fail-open as the
 * engine default G-065 names, one level below it.
 */
class ConsentJsonTest {
    private fun requestWith(consent: String?) = Json.request(
        Json.mapper.readTree(
            """{"tenantId":"t","customerId":"c","channel":"web","placement":"hero",
               "occurredAt":"2026-06-01T12:00:00.000Z","input":{}${consent?.let { ",\"consent\":$it" } ?: ""}}"""
        )
    )

    @Test
    fun `a purpose left out of the request is not stated`() {
        val consent = requestWith("""{"profiling":true}""").consent!!
        assertNull(consent.marketing)
        assertNull(consent.thirdParty)
        assertEquals(ConsentState.ABSENT, ConsentState.of(consent).marketing)
    }

    @Test
    fun `a purpose sent as null is not stated`() {
        assertNull(requestWith("""{"marketing":null,"profiling":false}""").consent!!.marketing)
    }

    @Test
    fun `a request with no consent at all states none`() {
        assertNull(requestWith(null).consent)
        assertEquals(ConsentState.ABSENT, ConsentState.of(requestWith(null).consent).marketing)
    }
}
