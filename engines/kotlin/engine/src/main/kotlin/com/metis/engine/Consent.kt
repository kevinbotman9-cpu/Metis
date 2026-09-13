package com.metis.engine

/**
 * Consent as a decision holds it. ADR-014 §7.1, G-065.
 *
 * Mirrors `packages/runtime/src/deterministic/consent.ts`, and the decision
 * corpus holds the two to the same bytes. Until 2026-09-13 both engines read a
 * request with no consent as marketing and profiling granted, and recorded that
 * substitute under the chain hash as though it had been stated.
 *
 * Each purpose is `granted`, `withheld` or `absent`. Absent — nobody said — is
 * enforced exactly as withheld and recorded as itself.
 */
data class ConsentState(val marketing: String, val profiling: String, val thirdParty: String) {

    /** The request consent that produces this state, for replay. Absent stays unstated. */
    fun asAssertion(): Consent = Consent(stated(marketing), stated(profiling), stated(thirdParty))

    companion object {
        const val GRANTED = "granted"
        const val WITHHELD = "withheld"
        const val ABSENT = "absent"

        /** The recorded state for a request's consent, including none at all. */
        fun of(asserted: Consent?): ConsentState =
            ConsentState(valueOf(asserted?.marketing), valueOf(asserted?.profiling), valueOf(asserted?.thirdParty))

        /** Only a stated yes permits. Withheld and absent are the same to enforcement. */
        fun permits(value: String): Boolean = value == GRANTED

        private fun valueOf(stated: Boolean?): String = when (stated) {
            null -> ABSENT
            true -> GRANTED
            false -> WITHHELD
        }

        private fun stated(value: String): Boolean? = when (value) {
            GRANTED -> true
            WITHHELD -> false
            else -> null
        }
    }
}
