/**
 * Consent as a decision holds it. ADR-014 §7.1, G-065.
 *
 * A caller asserts consent per purpose — marketing, profiling, third party — or
 * leaves a purpose out. Until 2026-09-13 both engines read a request with no
 * consent as `{ marketing: true, profiling: true, thirdParty: false }`, and the
 * decision recorded that substitute under its chain hash as though the customer
 * had given it. So the record of a decision nobody consented to said, verifiably,
 * that consent was given. That inverted the rule for compliance data: fail closed.
 *
 * A purpose is now one of three things:
 *
 * - **granted**: the caller said yes;
 * - **withheld**: the caller said no;
 * - **absent**: nobody said. Enforced exactly as withheld, recorded as itself, so
 *   a trace never claims consent that was not stated.
 *
 * This is §7.1 only. Consent is still what the request asserts: reading it from
 * the consent platform, with the request only able to narrow it, is §7.2 and
 * the rest of G-065.
 *
 * Mirrored in `engines/kotlin/engine/src/main/kotlin/com/metis/engine/Consent.kt`;
 * the decision corpus holds the two engines to the same bytes.
 */

export type ConsentValue = 'granted' | 'withheld' | 'absent';

/** What a decision records about consent, per purpose. Hashed. */
export interface ConsentState {
  marketing: ConsentValue;
  profiling: ConsentValue;
  thirdParty: ConsentValue;
}

/** What a caller sends. A purpose that is missing, or null, was not stated. */
export interface ConsentAssertion {
  marketing?: boolean | null;
  profiling?: boolean | null;
  thirdParty?: boolean | null;
}

const valueOf = (stated: boolean | null | undefined): ConsentValue =>
  stated === undefined || stated === null ? 'absent' : stated ? 'granted' : 'withheld';

/** The recorded state for a request's consent, including none at all. */
export function consentStateOf(asserted: ConsentAssertion | null | undefined): ConsentState {
  return {
    marketing: valueOf(asserted?.marketing),
    profiling: valueOf(asserted?.profiling),
    thirdParty: valueOf(asserted?.thirdParty),
  };
}

/** Only a stated yes permits. Withheld and absent are the same to enforcement. */
export const permits = (value: ConsentValue): boolean => value === 'granted';

/**
 * The request consent that produces a recorded state — for replay, which
 * re-executes a decision from its record. An absent purpose is left out rather
 * than sent as false, so the replayed decision records it as absent again.
 */
export function assertionOf(state: ConsentState): ConsentAssertion {
  const out: ConsentAssertion = {};
  for (const purpose of ['marketing', 'profiling', 'thirdParty'] as const) {
    if (state[purpose] !== 'absent') out[purpose] = state[purpose] === 'granted';
  }
  return out;
}
