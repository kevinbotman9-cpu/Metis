/**
 * Types for the deterministic execution core.
 *
 * The central design decision: a trace is split into a deterministic part and
 * a measured part.
 *
 *   DecisionRecord.decision  - what was decided and why. Reproducible.
 *   DecisionRecord.measured  - how long it took. Not reproducible, by nature.
 *
 * Only the deterministic part is hashed into `chainHash`, and only that part is
 * compared on replay. The previous executor hashed wall-clock timings into the
 * trace, which meant two runs of the same decision could never match - the
 * platform's central claim was false by construction.
 */

import type {
  Offer,
  Action,
  TargetingPolicy,
  FrequencyPolicy,
  ArbitrationConfig,
  Boost,
  Connector,
  FieldOrigin,
  ResolvedField,
  SourceCall,
} from '@metis/core/domain';

/** Node kinds the engine can execute. Mirrors what the canvas renders. */
export type ExecNodeType =
  | 'source'
  | 'filter'
  | 'constraint'
  | 'score-model'
  | 'score-adaptive'
  | 'switch'
  | 'explain-annotate'
  | 'arbitrate';

/**
 * The data model a decision was read against. ADR-014 §2.
 *
 * Mirrors `SchemaPin` in `@metis/core`, repeated for the same reason
 * `MissingScoreDefault` is: the runtime does not otherwise depend on the
 * schema module, and one triple is not worth the edge.
 */
export interface SchemaPin {
  id: string;
  version: string;
  hash: string;
}

export interface ExecNode {
  id: string;
  type: ExecNodeType;
  label: string;
  /** Targeting policies this node evaluates. */
  policyIds?: string[];
  /** Pinned model, for score nodes. Pinning is what makes replay possible. */
  model?: { id: string; version: string };
  /** Frequency policies this node enforces, for constraint nodes. */
  frequencyPolicyIds?: string[];
  /**
   * Connectors this node draws on, for source nodes.
   *
   * The engine never calls them - `resolveInputs` does, before execution, and
   * the values arrive in `request.input`. What the engine does with these is
   * record where each value they provide came from — the connector, its
   * default, or the request (`fieldOrigins`, ADR-022) — so the trace can answer
   * "where did this credit score come from" truthfully.
   */
  connectorIds?: string[];
}

export interface ExecEdge {
  from: string;
  to: string;
}

/** A compiled, immutable flow. Everything needed to reproduce a decision. */
/**
 * What to use for a candidate no scoring node produced a score for.
 *
 * §6 says a missing score must never become a silent zero, and asks for a
 * *configurable approved default* rather than a constant. The engine used
 * a hardcoded neutral 1.0, which is correct arithmetic — under exponentiation
 * a neutral term is 1, not 0 — but it is a number nobody chose. The difference
 * matters when someone asks why an unscored offer outranked a scored one: "the
 * engine assumes 1.0" is an implementation detail, and "the flow declares 0.3,
 * approved by this person on this date" is an answer.
 *
 * It lives on the artifact rather than the catalogue because the flow is what
 * determines whether anything scores at all — a flow with no scoring node for
 * anonymous web traffic is a legitimate design, and its author is the one who
 * should say what ranking does about it. The artifact is also immutably
 * versioned and hashed, so the default a decision used is recoverable.
 */
export interface MissingScoreDefault {
  /** Stands in for a model output nobody produced. */
  propensity: number;
  /** Stands in for a context multiplier nobody computed. */
  context: number;
  /** Approval is what makes this a default rather than a magic number. */
  approvedBy: string;
  approvedAt: string;
}

export interface ExecArtifact {
  id: string;
  version: string;
  tenantId: string;
  nodes: ExecNode[];
  edges: ExecEdge[];
  /** Offer keys forming the initial candidate set. */
  candidateKeys: string[];
  /** Package versions pinned at compile time. */
  packageVersions: Record<string, string>;
  /** The data model pinned at compile time. ADR-014 §2. */
  schema?: SchemaPin;
  /**
   * Declared by the flow, carried into the decision.
   *
   * Optional: a flow that scores every candidate never needs one, and
   * requiring it would be ceremony. When absent the engine uses a neutral
   * 1.0 and the decision record says so.
   */
  missingScoreDefault?: MissingScoreDefault;
}

/**
 * The catalogue as it stood when the decision was made.
 *
 * Passed in rather than read from a live store, because replaying against
 * today's catalogue would reproduce today's answer, not the original one.
 */
export interface CatalogueSnapshot {
  offers: Offer[];
  /**
   * What a flow may offer: each an offer made decidable (ADR-019 §1). A
   * candidate key is an action key. Generated one per offer today, inheriting
   * the offer's key (`generateActions`), and hashed with the rest.
   */
  actions: Action[];
  targetingPolicies: TargetingPolicy[];
  frequencyPolicies: FrequencyPolicy[];
  arbitration: ArbitrationConfig;
  boosts: Boost[];
  /**
   * Configured integrations.
   *
   * Part of the snapshot, and therefore part of the catalogue hash: changing a
   * connector's field mapping changes what decisions see, so it has to change
   * the hash too. A connector list that lived outside the snapshot would let
   * the same hash describe two different decisions.
   */
  connectors: Connector[];
}

export interface DecisionRequest {
  tenantId: string;
  customerId: string;
  channel: string;
  placement: string;
  /**
   * How many offers the placement shows — ADR-020 §2. Resolved from the
   * placement by the route that decides for it, and recorded on the decision;
   * the arbitrate node cuts the slate to it. Absent means 1. Not in `input`,
   * so it does not move `inputSnapshotHash`, and not in the catalogue
   * snapshot, so editing one placement moves no other decision's hash.
   */
  slotCount?: number;
  /**
   * When the decision is considered to have happened.
   *
   * An explicit input, never read from the system clock, so a replay lands on
   * the same validity windows and the same answer.
   */
  occurredAt: string;
  /** Customer and context attributes the policies are evaluated against. */
  input: Record<string, unknown>;
  /**
   * Prior contact, for frequency-policy enforcement.
   *
   * Supplied by the caller rather than read from the interaction log, because
   * the engine opens no sockets. `withinPeriod` counts contacts per period;
   * `rejects` is the most recent decline per offer key, ISO-8601, and drives
   * `cooldownDaysAfterReject`.
   *
   * Declines arrive here, from the caller, not from recorded outcomes. A
   * `rejection` outcome can be recorded, but an outcome names a decision rather
   * than an offer, so the cooldown does not read one until ADR-020 §4 settles
   * which offer on a slate it was for (G-153; G-086 for why `rejects` exists).
   * This said a decline was not an outcome until 2026-09-17.
   */
  contactHistory?: {
    channel: string;
    withinPeriod: Record<string, number>;
    rejects?: Record<string, string>;
  };
  /**
   * What the platform read from its ledger, set by the service resolving the
   * request and never taken from a caller's body. Added to `contactHistory`'s
   * counts, never instead of them: a caller may add contacts the platform did
   * not make and cannot remove any (ADR-014 §10). Recorded on the decision.
   */
  contactsRead?: ContactsRead;
  /**
   * What resolution wrote into the input, and how — ADR-022 §3. Set by the
   * service after `resolveInputs`, never taken from a caller's body, for
   * `contactsRead`'s reason: otherwise a caller could claim a system vouched for
   * its value. Absent when nothing was resolved, and then every present
   * connector-provided field is recorded as `request`.
   */
  resolved?: ResolvedField[];
  /**
   * What the caller asserts, per purpose. A purpose left out, or null, was not
   * stated: it is recorded as absent and enforced as withheld (ADR-014 §7.1).
   */
  consent?: import('./consent').ConsentAssertion;
  /**
   * A caller-chosen token that makes a retry safe.
   *
   * Deliberately outside the request hash: it identifies the *attempt*, not the
   * question. Same key and same hash returns the original decision; same key
   * and a different hash is a conflict, because the caller reused a token for a
   * different question and quietly answering would hand them a decision about
   * someone else's customer.
   */
  idempotencyKey?: string;
  /**
   * Caller-supplied tracing id, carried through to the measured half.
   *
   * Never hashed, and not part of the request hash either: it differs on every
   * call, so including it would make each retry look like a new request — the
   * exact failure idempotency exists to prevent.
   */
  correlationId?: string;
}

/**
 * Why one candidate was removed.
 *
 * Stable, parseable and translatable, which the prose `reason` on the step is
 * not. A denial has to answer "why was *this* action not offered to me" —
 * a question a regulator, a customer and a support agent all ask about a single
 * action, and which a node-level sentence like "Eligibility and Relevance
 * removed 2 candidate(s)" cannot answer at all.
 *
 * Codes are a closed set and never renamed. Adding one is a decision-shape
 * change: it enters the hashed decision, so the conformance corpora regenerate
 * and the Kotlin engine has to agree.
 */
/**
 * The closed set, as a value.
 *
 * A value rather than only a union because the conformance corpus has to check
 * that every code is exercised, and a type cannot be read at run time. That
 * check used to hold its own copy of this list, so a ninth code would have been
 * added here, shipped to a second engine, and never noticed by the guard whose
 * stated purpose is noticing exactly that. Now there is one list and the type
 * is derived from it.
 *
 * Order is the order a decision meets them, which is also the order they read
 * in a trace. Nothing depends on it, and keeping it meaningful costs nothing.
 */
export const REASON_CODES = [
  /** Retired, paused or draft — never really a candidate. */
  'NOT_ACTIVE',
  /** Outside its start/end window at the moment of the decision. */
  'OUT_OF_VALIDITY_WINDOW',
  /** Hard filter: we cannot legally or contractually offer this. */
  'ELIGIBILITY_FAILED',
  /** Situational: we could offer it, but not to this customer right now. */
  'RELEVANCE_FAILED',
  /** Affordability and ethics: it is not right for this customer. */
  'SUITABILITY_FAILED',
  /** Marketing consent withheld, and the offer is not service-exempt. */
  'CONSENT_WITHHELD',
  /**
   * A frequency cap covers this candidate, and the platform could not read how
   * often the customer has been contacted. ADR-021 §4.
   *
   * Suppressed rather than offered, because an unreadable count is not a count
   * of zero: reading it as zero would contact a customer whose cap is already
   * spent. The cap that covered the candidate is the `ruleId`.
   */
  'CONTACT_HISTORY_UNAVAILABLE',
  /**
   * A frequency cap was already spent: we have contacted them too much.
   *
   * Until 2026-09-11 this comment said "a cap or cooldown", and the cooldown
   * half was enforced by neither engine (G-086). A code that claims a rule
   * nobody runs is worse than a missing code, because it reads as coverage.
   */
  'FREQUENCY_CAP_BREACHED',
  /**
   * They declined this recently and the policy's rest period has not elapsed.
   *
   * Distinct from a cap on purpose: "they said no" and "we have said too much"
   * are different facts about a customer, and a trace that conflates them
   * cannot answer either question.
   */
  'COOLDOWN_ACTIVE',
  /** Survived every gate but did not win arbitration. */
  'NOT_RANKED',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

export interface Denial {
  /** The candidate this is about. */
  key: string;
  code: ReasonCode;
  /**
   * The rule that did it, where one is identifiable — a targeting policy id, a
   * frequency policy id. `null` for the codes that are properties of the
   * candidate itself rather than of a rule.
   *
   * Always present, never omitted. An optional key would mean two engines each
   * deciding when to drop it, and the canonical form differs if they disagree.
   */
  ruleId: string | null;
}

export interface EliminationStep {
  nodeId: string;
  /**
   * The node's type — or `consent`, for the one step that is not a node: the
   * platform applying consent to a decision whose flow did not (G-015).
   */
  nodeType: ExecNodeType | 'consent';
  /** Human sentence for the trace view. Not stable; do not parse it. */
  reason: string;
  /**
   * One entry per candidate removed here, sorted by key.
   *
   * Sorted rather than left in evaluation order because within a single node
   * the removals are simultaneous — no candidate is removed *because* another
   * was — so evaluation order carries no information and would only be a way
   * for two engines to disagree.
   */
  denials: Denial[];
  survived: string[];
}

export interface CandidateScore {
  propensity: number;
  value: number;
  boost: number;
  context: number;
  /**
   * Delivery cost, normalised the same way value is.
   *
   * Present on every score even though `multiplicative` ignores it: a term
   * that appears only when some function asks for it would make the decision
   * shape depend on the ranking config, and two decisions from one tenant
   * would then hash over different structures.
   */
  cost: number;
  priority: number;
}

/** The reproducible half of a trace. */
export interface DeterministicDecision {
  tenantId: string;
  artifactId: string;
  artifactVersion: string;
  customerRef: string;
  occurredAt: string;
  channel: string;
  placement: string;
  inputSnapshotHash: string;
  catalogueSnapshotHash: string;
  /**
   * Where each connector-provided value in the input came from — ADR-022 §2.
   *
   * One entry per field a connector on a source node provides, where the field
   * is present in the input: `connector` or `default` as resolution reported
   * (`request.resolved`), `request` for every other. Hashed (§4): "refused
   * because the serviceability system said the address cannot take fiber" and
   * "refused because the caller said so" are different findings, and the
   * record cannot be asked afterwards, because it keeps no values.
   *
   * The *values* are not here. They are in the input snapshot, which is hashed
   * but never stored, so a trace can be kept without keeping the customer data
   * it was made from.
   */
  fieldOrigins: FieldOrigin[];
  packageVersions: Record<string, string>;
  /**
   * The data model this decision's fields were resolved through, from the
   * artifact. ADR-014 §2.
   *
   * `null` when the artifact pins none, which is a fact about the artifact and
   * is recorded rather than omitted: absent and "compiled before the model
   * existed" would otherwise be indistinguishable after the fact.
   */
  schema: SchemaPin | null;
  candidateKeys: string[];
  eliminations: EliminationStep[];
  scores: Record<string, CandidateScore>;
  arbitration: {
    formula: string;
    /**
     * Which ranking function produced the priorities, by id and version.
     *
     * In the hashed decision because §14 requires a decision to identify every
     * version that produced it. Without this, two decisions ranked by
     * different functions on the same catalogue are indistinguishable after
     * the fact.
     */
    utility: { id: string; version: string };
    /**
     * What ranking did about candidates nothing scored.
     *
     * Present on every decision, including when nothing was missing, so the
     * absence of a default is stated rather than inferred from silence. A
     * record that only mentioned this when it happened would leave "no default
     * configured" and "written by an older engine" indistinguishable.
     */
    missingScore: {
      /** Candidate keys that fell back, sorted. Empty when everything scored. */
      applied: string[];
      /** Null when the flow declares none and the engine used a neutral 1.0. */
      approved: MissingScoreDefault | null;
    };
    winner: string | null;
    /**
     * The best finalist the slate left out (ADR-020 §1). For one slot, the
     * candidate that came second, as it always meant.
     */
    runnerUp: string | null;
  };
  constraintsApplied: string[];
  /** Per purpose: granted, withheld, or absent — never a substitute for what was not stated. */
  consentState: import('./consent').ConsentState;
  /**
   * What the platform read from its own ledger about this customer's contacts,
   * before deciding. ADR-021 §5.
   *
   * **Absent means the platform did not read** — no cap applied on this
   * channel, or the decision was made somewhere that does not read (the seeded
   * generator, a conformance case, a caller of the engine as a function). A
   * present field with every count zero means it read and found nothing. The
   * two must never render the same way: one says the caps saw only what a
   * caller sent, the other that the platform looked and the customer is clear.
   *
   * Hashed, so the counts a cap was held to are part of what was decided, and a
   * replay reads them from here rather than from a ledger that has since moved
   * on. Added only when present, so no decision that never read the ledger
   * changes identity.
   */
  contactsRead?: ContactsRead;
  /**
   * The action key in slot 1 — `slate[0].action`, or null when nothing was
   * shown. Kept as its own stored field, with its meaning unchanged, so every
   * reader of `winner` keeps working (ADR-020 §1). The engine refuses to write
   * a record where the two disagree.
   */
  winner: string | null;
  winnerOfferId: string | null;
  /** How many slots the placement had when this was decided (ADR-020 §2). Replay uses this, not today's. */
  slotCount: number;
  /**
   * What was shown, best first: one entry per slot filled — ADR-020 §1.
   *
   * `offerId` is stored, not derived, so what a decision says it showed does
   * not depend on a catalogue that has moved on. Written by the arbitrate node
   * in both engines, not by a route, so two engines that disagree about what
   * was shown fail `decision-conformance`.
   */
  slate: SlateRecordEntry[];
}

/** One slot of a recorded slate. */
export interface SlateRecordEntry {
  /** 1-based. */
  rank: number;
  /** The action key. */
  action: string;
  offerId: string;
  /** The priority ranking gave it: the same number that ordered the slate. */
  priority: number;
}

/**
 * The platform's read of a customer's contacts on the decision's channel.
 *
 * `read`: distinct decisions handed over or delivered to this customer on this
 * channel, per rolling window back from `occurredAt` (ADR-021 §2, §3).
 * `unavailable`: the ledger could not be read; every candidate a cap covers is
 * suppressed with `CONTACT_HISTORY_UNAVAILABLE` (§4). Why it could not be read
 * is operational and is not in the hash.
 *
 * `scoped`: for each active cap on this channel whose scope is narrower than the
 * tenant, the contacts *about that scope* — decisions whose recorded offer the
 * scope covers — keyed by the cap's id. A scope that did not narrow what is
 * counted would not be a scope (ADR-021 §9, amending §1). Present only when such
 * a cap exists, so a read with none keeps its identity.
 */
export type ContactsRead =
  | {
      status: 'read';
      channel: string;
      withinPeriod: ContactWindow;
      scoped?: Record<string, ContactWindow>;
    }
  | { status: 'unavailable'; channel: string };

/** Contacts per rolling window back from the decision. */
export type ContactWindow = { day: number; week: number; month: number };

/** The measured half. Observability only - never hashed, never replayed. */
export interface Measurements {
  timingsByNode: Record<string, number>;
  totalMs: number;
  executedAt: string;
  /**
   * The caller's tracing id, echoed back.
   *
   * In the measured half because it is real and useful and cannot be part of
   * decision identity: two retries of one request are the same decision with
   * different correlation ids.
   */
  correlationId?: string;
  /**
   * What the integrations actually did: latency, cache hits, failures.
   *
   * Measured by definition, and so kept well away from the hash. Whether the
   * bureau answered from cache in 2ms or from the wire in 180ms changes nothing
   * about what was decided, and a replay six months later must not be judged
   * against today's cache state.
   *
   * Absent on a replayed trace, because replay calls no connectors.
   */
  sourceCalls?: SourceCall[];
}

export interface DecisionRecord {
  id: string;
  decision: DeterministicDecision;
  measured: Measurements;
  /** sha256 over `decision` alone. */
  chainHash: string;
}

export interface ReplayResult {
  identical: boolean;
  decisionId: string;
  originalChainHash: string;
  replayedChainHash: string;
  /** Populated only when the two differ. */
  differences: { path: string; original: unknown; replayed: unknown }[];
}
