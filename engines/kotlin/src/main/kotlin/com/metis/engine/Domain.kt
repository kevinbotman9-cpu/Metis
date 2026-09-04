package com.metis.engine

/**
 * The decision domain, ported from `packages/core/src/domain.ts` and
 * `packages/runtime/src/deterministic/types.ts`.
 *
 * Only what the engine reads. Anything the TypeScript types carry for the
 * console's benefit — display names, timestamps, audit fields — is absent here
 * and stays in the raw JSON, because the engine never looks at it and the
 * catalogue hash is computed from that raw tree rather than from these classes.
 *
 * That split is deliberate. Reconstructing the catalogue's exact key set from
 * typed classes would mean modelling every optional field precisely enough to
 * reproduce which ones were present, and getting one wrong would change a hash
 * for reasons that have nothing to do with decisioning.
 */

// --- Catalogue ---------------------------------------------------------------

data class Money(val amount: Double, val currency: String)

data class Financials(val expectedMargin: Money)

data class ValidityWindow(val startsAt: String, val endsAt: String?)

data class PolicyScope(val level: String, val targetId: String?)

data class Proposition(
    val id: String,
    val groupId: String,
    val issueId: String,
    val key: String,
    val status: String,
    val financials: Financials,
    val validity: ValidityWindow,
    val lever: Double,
    val policyIds: List<String>,
)

data class PolicyCondition(val field: String, val operator: String, val value: Any?)

data class EngagementPolicy(
    val id: String,
    val kind: String,
    val conditions: List<PolicyCondition>,
    val scope: PolicyScope,
    val active: Boolean,
)

data class ContactPolicy(
    val id: String,
    val channel: String?,
    val maxContacts: Double,
    val period: String,
    val scope: PolicyScope,
    val active: Boolean,
)

data class ArbitrationWeights(
    val propensity: Double,
    val value: Double,
    val lever: Double,
    val context: Double,
)

data class ArbitrationConfig(val weights: ArbitrationWeights, val formula: String)

data class Lever(
    val id: String,
    val scope: PolicyScope,
    val value: Double,
    val validity: ValidityWindow?,
)

data class FieldBinding(val field: String, val path: String, val type: String)

data class Connector(
    val id: String,
    val provides: List<FieldBinding>,
    val active: Boolean,
)

data class CatalogueSnapshot(
    val propositions: List<Proposition>,
    val engagementPolicies: List<EngagementPolicy>,
    val contactPolicies: List<ContactPolicy>,
    val arbitration: ArbitrationConfig,
    val levers: List<Lever>,
    val connectors: List<Connector>,
)

// --- Artifact ----------------------------------------------------------------

data class ExecNode(
    val id: String,
    val type: String,
    val label: String,
    val policyIds: List<String>? = null,
    val model: Model? = null,
    val contactPolicyIds: List<String>? = null,
    val connectorIds: List<String>? = null,
)

data class Model(val id: String, val version: String)

data class ExecEdge(val from: String, val to: String)

data class ExecArtifact(
    val id: String,
    val version: String,
    val tenantId: String,
    val nodes: List<ExecNode>,
    val edges: List<ExecEdge>,
    val candidateKeys: List<String>,
    val packageVersions: Map<String, String>,
)

// --- Request -----------------------------------------------------------------

data class ContactHistory(val channel: String, val withinPeriod: Map<String, Double>)

data class Consent(val marketing: Boolean, val profiling: Boolean, val thirdParty: Boolean)

data class DecisionRequest(
    val tenantId: String,
    val customerId: String,
    val channel: String,
    val placement: String,
    /** An input, never the clock. The same rule the TypeScript engine follows. */
    val occurredAt: String,
    val input: Map<String, Any?>,
    val contactHistory: ContactHistory? = null,
    val consent: Consent? = null,
)

// --- Trace -------------------------------------------------------------------

data class EliminationStep(
    val nodeId: String,
    val nodeType: String,
    val reason: String,
    val eliminated: List<String>,
    val survived: List<String>,
)

data class CandidateScore(
    val propensity: Double,
    val value: Double,
    val lever: Double,
    val context: Double,
    var priority: Double,
)

data class SourceBinding(val field: String, val connectorId: String, val nodeId: String)

data class Arbitration(val formula: String, val winner: String?, val runnerUp: String?)

/** The reproducible half. Field order here is irrelevant: canonicalise sorts. */
data class DeterministicDecision(
    val tenantId: String,
    val artifactId: String,
    val artifactVersion: String,
    val customerRef: String,
    val occurredAt: String,
    val channel: String,
    val placement: String,
    val inputSnapshotHash: String,
    val catalogueSnapshotHash: String,
    val sourceBindings: List<SourceBinding>,
    val packageVersions: Map<String, String>,
    val candidateKeys: List<String>,
    val eliminations: List<EliminationStep>,
    val scores: Map<String, CandidateScore>,
    val arbitration: Arbitration,
    val constraintsApplied: List<String>,
    val consentState: Consent,
    val winner: String?,
    val winnerPropositionId: String?,
)

data class DecisionTrace(
    val id: String,
    val decision: DeterministicDecision,
    val chainHash: String,
)
