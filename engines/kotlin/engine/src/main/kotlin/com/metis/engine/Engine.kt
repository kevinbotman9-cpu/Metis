package com.metis.engine

import com.metis.canonical.Canonical
import java.security.MessageDigest

/**
 * The deterministic execution engine, in Kotlin.
 *
 * A second implementation of `packages/runtime/src/deterministic/engine.ts`,
 * held to byte-identical output by `docs/conformance/decision-corpus.json`.
 * Same artifact, same catalogue, same request, same chain hash — or this is
 * not a port, it is a different engine that happens to look similar.
 *
 * The same rules apply here as there, and for the same reasons:
 *   - No clock, no RNG, no UUIDs in the decision path. Time arrives as
 *     `request.occurredAt`; randomness comes from seeded hashes.
 *   - Node visit order is a deterministic topological sort, ties broken by id.
 *   - The catalogue is a snapshot argument, never a live lookup.
 *
 * Timings are not produced at all. They are the measured half of a trace, they
 * are excluded from the hash by design, and a port that invented them would be
 * adding a field with nothing to compare it against.
 */
object Engine {

    /**
     * A cap this high is not a real frequency limit; it is a scope declaring
     * itself exempt, which is how service messages stay deliverable when
     * commercial offers are suppressed.
     */
    private const val SERVICE_EXEMPT_THRESHOLD = 50.0

    private val KIND_LABEL = mapOf(
        "eligibility" to "Eligibility",
        "relevance" to "Relevance",
        "suitability" to "Suitability",
    )

    /**
     * One code per qualification tier, not one per policy: the tier is what a
     * customer or a regulator can act on, and the specific policy travels
     * alongside in `ruleId`. Must match KIND_CODE in the TypeScript engine.
     */
    private val KIND_CODE = mapOf(
        "eligibility" to "ELIGIBILITY_FAILED",
        "relevance" to "RELEVANCE_FAILED",
        "suitability" to "SUITABILITY_FAILED",
    )

    // --- Policy evaluation ---------------------------------------------------

    /** Read a dotted path such as "customer.age" out of the request input. */
    private fun readPath(input: Map<String, Any?>, path: String): Any? {
        var acc: Any? = input
        for (key in path.split(".")) {
            @Suppress("UNCHECKED_CAST")
            acc = (acc as? Map<String, Any?>)?.get(key) ?: return if (acc is Map<*, *>) null else null
        }
        return acc
    }

    private fun compare(actual: Any?, operator: String, expected: Any?): Boolean = when (operator) {
        "exists" -> actual != null
        "not_exists" -> actual == null
        "eq" -> looseEquals(actual, expected)
        "ne" -> !looseEquals(actual, expected)
        "in" -> expected is List<*> && expected.any { looseEquals(actual, it) }
        "not_in" -> expected is List<*> && !expected.any { looseEquals(actual, it) }
        "contains" ->
            (actual is String && expected is String && actual.contains(expected)) ||
                (actual is List<*> && actual.any { looseEquals(it, expected) })

        // A missing value must not silently pass a numeric comparison: in
        // JavaScript undefined coerces to NaN and every NaN comparison is
        // false, which reads as "failed the rule" rather than "could not be
        // evaluated". Both engines are explicit about it instead.
        "gt", "gte", "lt", "lte" -> {
            val a = actual as? Double
            val b = expected as? Double
            if (a == null || b == null) false
            else when (operator) {
                "gt" -> a > b
                "gte" -> a >= b
                "lt" -> a < b
                else -> a <= b
            }
        }

        else -> false
    }

    /**
     * JavaScript `===` over the value types a policy can hold.
     *
     * Numbers arrive as Double on both sides because JSON has one number type,
     * so this is reference-free structural equality rather than Kotlin's
     * type-sensitive `==` across Int and Double.
     */
    private fun looseEquals(a: Any?, b: Any?): Boolean = when {
        a == null || b == null -> a == null && b == null
        a is Double && b is Double -> a == b
        else -> a == b
    }

    /** All conditions must hold. Separate policies express OR. */
    private fun policyPasses(policy: TargetingPolicy, input: Map<String, Any?>): Boolean =
        policy.conditions.all { compare(readPath(input, it.field), it.operator, it.value) }

    private fun scopeCovers(scope: PolicyScope, p: Offer): Boolean = when (scope.level) {
        "tenant" -> true
        "objective" -> scope.targetId == p.objectiveId
        "category" -> scope.targetId == p.categoryId
        "offer" -> scope.targetId == p.id
        else -> false
    }

    private val SCOPE_RANK = mapOf("tenant" to 0, "objective" to 1, "category" to 2, "offer" to 3)

    /** Most specific scope wins; falls back to the offer's own weight. */
    private fun effectiveBoost(boosts: List<Boost>, p: Offer, occurredAt: String): Double {
        val applicable = boosts.filter { l ->
            if (!scopeCovers(l.scope, p)) return@filter false
            val v = l.validity ?: return@filter true
            val day = occurredAt.take(10)
            if (day < v.startsAt) return@filter false
            if (v.endsAt != null && day > v.endsAt) return@filter false
            true
        }
        if (applicable.isEmpty()) return p.boost
        return applicable.reduce { best, cur ->
            if ((SCOPE_RANK[cur.scope.level] ?: -1) > (SCOPE_RANK[best.scope.level] ?: -1)) cur else best
        }.value
    }

    private fun withinValidity(p: Offer, occurredAt: String): Boolean {
        val day = occurredAt.take(10)
        if (day < p.validity.startsAt) return false
        val end = p.validity.endsAt
        if (end != null && day > end) return false
        return true
    }

    // --- Graph ordering ------------------------------------------------------

    /**
     * Kahn's algorithm with ties broken by node id.
     *
     * Two runs that visit filters in a different order attribute the same
     * elimination to different nodes, so the traces differ even though the
     * winner does not. Sorting is what makes the order a property of the graph
     * rather than of the language's map iteration.
     */
    fun topologicalOrder(artifact: ExecArtifact): List<ExecNode> {
        val byId = artifact.nodes.associateBy { it.id }
        val indegree = artifact.nodes.associate { it.id to 0 }.toMutableMap()
        val outgoing = mutableMapOf<String, MutableList<String>>()

        for (e in artifact.edges) {
            require(byId.containsKey(e.from) && byId.containsKey(e.to)) {
                "Edge references a node that does not exist: ${e.from} -> ${e.to}"
            }
            indegree[e.to] = (indegree[e.to] ?: 0) + 1
            outgoing.getOrPut(e.from) { mutableListOf() }.add(e.to)
        }

        val ready = indegree.filterValues { it == 0 }.keys.sorted().toMutableList()
        val order = mutableListOf<ExecNode>()

        while (ready.isNotEmpty()) {
            val id = ready.removeAt(0)
            order.add(byId.getValue(id))
            for (next in (outgoing[id] ?: emptyList()).sorted()) {
                val d = (indegree[next] ?: 0) - 1
                indegree[next] = d
                if (d == 0) {
                    ready.add(next)
                    ready.sort()
                }
            }
        }

        require(order.size == artifact.nodes.size) {
            "Flow graph contains a cycle; execution must terminate"
        }
        return order
    }

    // --- Rounding and hashing ------------------------------------------------

    /**
     * JavaScript's `Math.round(n * 10^dp) / 10^dp`.
     *
     * `Math.round` in JavaScript resolves a tie toward positive infinity, and
     * so does `floor(x + 0.5)`. Java's `Math.round(Double)` does the same but
     * returns a Long, which overflows on the large intermediates this produces,
     * so the floor form is used explicitly.
     */
    private fun round(n: Double, dp: Int): Double {
        val f = Math.pow(10.0, dp.toDouble())
        return Math.floor(n * f + 0.5) / f
    }

    /**
     * Deterministic value in [0, 1) derived from a key.
     *
     * Stand-in for a pinned model: same customer, same offer, same model
     * version always yields the same number. Must match
     * `seededUnitInterval` in canonical.ts byte for byte, which is why the
     * parts are joined with a single space and the first six bytes are read
     * big-endian.
     */
    fun seededUnitInterval(vararg parts: String): Double {
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(parts.joinToString(" ").toByteArray(Charsets.UTF_8))
        var value = 0L
        for (i in 0 until 6) value = (value shl 8) or (digest[i].toLong() and 0xff)
        // 48 bits is comfortably inside Double's exact integer range, so the
        // division loses nothing.
        return value.toDouble() / Math.pow(2.0, 48.0)
    }

    // --- Execution -----------------------------------------------------------

    fun execute(
        artifact: ExecArtifact,
        catalogue: CatalogueSnapshot,
        request: DecisionRequest,
        /**
         * Hashes of the catalogue and input, computed from the raw JSON trees.
         *
         * Passed in rather than derived here: the engine's typed model omits
         * fields the console needs and the hash does not care about, and
         * rebuilding the exact key set from those classes would make a hash
         * depend on how faithfully the port modelled display metadata.
         */
        catalogueSnapshotHash: String,
        inputSnapshotHash: String,
    ): DecisionRecord {
        val byKey = catalogue.offers.associateBy { it.key }
        val policyById = catalogue.targetingPolicies.associateBy { it.id }
        val connectorById = catalogue.connectors.associateBy { it.id }
        val sourceBindings = mutableListOf<SourceBinding>()

        // Initial candidate set, in artifact order so it is reproducible.
        var candidates: List<Offer> = artifact.candidateKeys.mapNotNull { byKey[it] }

        val consent = request.consent ?: Consent(marketing = true, profiling = true, thirdParty = false)
        val eliminations = mutableListOf<EliminationStep>()
        val scores = linkedMapOf<String, CandidateScore>()
        val constraintsApplied = mutableListOf<String>()
        /** Candidates that fell back because nothing scored them. */
        val missingScoreApplied = mutableListOf<String>()
        var winner: String? = null
        var runnerUp: String? = null

        // Resolved once and thrown on rather than defaulted. A config naming
        // a function that does not exist is a deployment fault; falling back
        // silently would rank by something other than what was configured.
        // Publishing is gated on this, so reaching here means the artifact
        // skipped the compiler.
        val utility = Utility.resolve(catalogue.arbitration.utility)
            ?: throw IllegalArgumentException(
                "Unknown ranking function ${Utility.key(catalogue.arbitration.utility)}."
            )

        // Denials are passed in, not derived from the before/after diff: the
        // diff knows which candidates went, only the removing code knows why.
        fun record(node: ExecNode, reason: String, after: List<Offer>, denials: List<Denial>) {
            eliminations.add(
                EliminationStep(
                    nodeId = node.id,
                    nodeType = node.type,
                    reason = reason,
                    denials = denials.sortedBy { it.key },
                    survived = after.map { it.key },
                )
            )
        }

        for (node in topologicalOrder(artifact)) {
            val before = candidates

            when (node.type) {
                "source" -> {
                    // Provenance, not fetching. Resolution already ran outside
                    // the deterministic core and the values are in the input.
                    for (connectorId in node.connectorIds ?: emptyList()) {
                        val connector = connectorById[connectorId] ?: continue
                        if (!connector.active) continue
                        for (binding in connector.provides) {
                            if (!request.input.containsKey(binding.field)) continue
                            sourceBindings.add(SourceBinding(binding.field, connectorId, node.id))
                        }
                    }

                    // Status before validity, so a retired offer that is also
                    // out of window reports as retired — the more fundamental
                    // fact, and the one that has to change first.
                    val sourceDenials = mutableListOf<Denial>()
                    candidates = before.filter { p ->
                        when {
                            p.status != "active" -> {
                                sourceDenials.add(Denial(p.key, "NOT_ACTIVE", null)); false
                            }
                            !withinValidity(p, request.occurredAt) -> {
                                sourceDenials.add(Denial(p.key, "OUT_OF_VALIDITY_WINDOW", null)); false
                            }
                            else -> true
                        }
                    }

                    val ids = node.connectorIds ?: emptyList()
                    val sourced = if (ids.isNotEmpty()) {
                        val fields = sourceBindings.filter { it.nodeId == node.id }.map { it.field }
                        val list = if (fields.isEmpty()) "none resolved" else fields.joinToString(", ")
                        " Fields from ${ids.size} connector(s): $list."
                    } else ""

                    val base = if (candidates.size == before.size) {
                        "Loaded profile for ${request.customerId}. All ${before.size} candidates are active and in their validity window."
                    } else {
                        "Loaded profile for ${request.customerId}. Removed ${before.size - candidates.size} candidate(s) that were retired, paused or outside their validity window."
                    }
                    record(node, base + sourced, candidates, sourceDenials)
                }

                "filter", "constraint" -> {
                    val policies = (node.policyIds ?: emptyList())
                        .mapNotNull { policyById[it] }
                        .filter { it.active }

                    val denials = mutableListOf<Denial>()

                    // The first failing policy, in the artifact's declared
                    // order. A candidate can breach several; one thing to fix
                    // is more useful than all of them, and the order is the
                    // artifact's own so the choice is deterministic.
                    candidates = before.filter { p ->
                        val failed = policies.firstOrNull { policy ->
                            if (!scopeCovers(policy.scope, p)) return@firstOrNull false
                            if (!p.policyIds.contains(policy.id) && policy.scope.level == "offer") {
                                return@firstOrNull false
                            }
                            !policyPasses(policy, request.input)
                        }
                        if (failed != null) {
                            denials.add(Denial(p.key, KIND_CODE.getValue(failed.kind), failed.id))
                            false
                        } else true
                    }

                    if (node.type == "constraint") {
                        val used = request.contactHistory?.withinPeriod ?: emptyMap()

                        // Frequency policies bind to a scope exactly like
                        // targeting policies. Applying them all to every
                        // candidate once suppressed an entire catalogue.
                        fun relevantTo(p: Offer) = catalogue.frequencyPolicies.filter { c ->
                            c.active &&
                                scopeCovers(c.scope, p) &&
                                (c.channel == null || c.channel == request.channel)
                        }

                        for (p in candidates) for (c in relevantTo(p)) constraintsApplied.add(c.id)

                        candidates = if (!consent.marketing) {
                            // Withheld consent removes commercial offers but
                            // not duty-of-care messages, which is why a scope
                            // can raise its own cap.
                            candidates.filter { p ->
                                val exempt = relevantTo(p).any { it.maxContacts >= SERVICE_EXEMPT_THRESHOLD }
                                if (!exempt) denials.add(Denial(p.key, "CONSENT_WITHHELD", null))
                                exempt
                            }
                        } else {
                            candidates.filter { p ->
                                // The first breached cap, in catalogue order.
                                // Naming which one is the difference between
                                // "contacted too much" and a policy someone can
                                // go and look at.
                                val breached = relevantTo(p).firstOrNull {
                                    (used[it.period] ?: 0.0) >= it.maxContacts
                                }
                                if (breached != null) {
                                    denials.add(Denial(p.key, "FREQUENCY_CAP_BREACHED", breached.id))
                                }
                                breached == null
                            }
                        }
                    }

                    val kinds = policies.mapNotNull { KIND_LABEL[it.kind] }.distinct().sorted()
                    val removed = before.size - candidates.size
                    val joined = kinds.joinToString(" and ")
                    record(
                        node,
                        if (removed > 0) {
                            "${joined.ifEmpty { node.label }} removed $removed candidate(s)."
                        } else {
                            "All ${before.size} candidate(s) passed ${joined.ifEmpty { node.label }.lowercase()}."
                        },
                        candidates,
                        denials,
                    )
                }

                "score-model", "score-adaptive" -> {
                    val modelKey = node.model?.let { "${it.id}@${it.version}" } ?: node.id
                    for (p in candidates) {
                        val propensity = round(
                            0.05 + seededUnitInterval(request.customerId, p.key, modelKey) * 0.9, 6
                        )
                        val value = round(maxOf(0.01, p.financials.expectedMargin.amount / 60000.0), 6)
                        val boost = effectiveBoost(catalogue.boosts, p, request.occurredAt)
                        val context = round(
                            0.4 + seededUnitInterval(request.channel, p.key, request.placement) * 0.6, 6
                        )
                        // Same scale as value, so a function can subtract one
                        // from the other and get a real number.
                        val cost = round(maxOf(0.0, p.financials.cost.amount / 60000.0), 6)
                        scores[p.key] = CandidateScore(propensity, value, boost, context, cost, 0.0)
                    }
                    // Scoring never removes a candidate, so nothing is denied.
                    //
                    // The sentence names the kind of scorer. It must match the
                    // TypeScript engine byte for byte: the reason is in the
                    // hashed decision, so a difference here is a conformance
                    // failure, not a wording preference.
                    record(node, "Scored ${candidates.size} candidate(s) with $modelKey — a pinned deterministic function, not a trained model (W-029).", candidates, emptyList())
                }

                "arbitrate" -> {
                    val w = catalogue.arbitration.weights

                    // A candidate with no model score is not disqualified. Some
                    // flows legitimately rank without a propensity model —
                    // anonymous web traffic has no customer to score — and their
                    // formula says so.
                    //
                    // What stands in is the flow's approved default where it
                    // declares one, and a neutral 1.0 where it does not.
                    val approvedDefault = artifact.missingScoreDefault
                    for (p in candidates) {
                        if (scores.containsKey(p.key)) continue
                        missingScoreApplied.add(p.key)
                        scores[p.key] = CandidateScore(
                            propensity = approvedDefault?.propensity ?: 1.0,
                            value = round(maxOf(0.01, p.financials.expectedMargin.amount / 60000.0), 6),
                            boost = effectiveBoost(catalogue.boosts, p, request.occurredAt),
                            context = approvedDefault?.context ?: 1.0,
                            // A catalogue fact, not a model output, so it is
                            // known even when nothing scored this candidate.
                            cost = round(maxOf(0.0, p.financials.cost.amount / 60000.0), 6),
                            priority = 0.0,
                        )
                    }

                    for (p in candidates) {
                        val s = scores[p.key] ?: continue
                        // StrictMath, not Math. Neither JavaScript's Math.pow
                        // nor Java's is required to be correctly rounded, so
                        // they may differ by an ulp — which after rounding to
                        // 8dp can still change a hash. StrictMath is fdlibm,
                        // and so is V8's implementation, so they agree.
                        // Rounding stays at the call site, not inside the
                        // evaluator: it is how this engine records a priority,
                        // not part of the arithmetic the function describes.
                        s.priority = round(
                            Utility.evaluate(
                                utility,
                                mapOf(
                                    "propensity" to s.propensity,
                                    "value" to s.value,
                                    "boost" to s.boost,
                                    "context" to s.context,
                                    "cost" to s.cost,
                                ),
                                mapOf(
                                    "propensity" to w.propensity,
                                    "value" to w.value,
                                    "boost" to w.boost,
                                    "context" to w.context,
                                ),
                            ),
                            8,
                        )
                    }

                    // Sort by priority, then by key, so equal scores never flip
                    // between runs or between engines.
                    val ranked = candidates
                        .filter { scores.containsKey(it.key) }
                        .sortedWith(
                            compareByDescending<Offer> { scores.getValue(it.key).priority }
                                .thenBy { it.key }
                        )

                    winner = ranked.getOrNull(0)?.key
                    runnerUp = ranked.getOrNull(1)?.key
                    candidates = ranked.take(1)

                    record(
                        node,
                        if (winner != null) {
                            "Ranked ${ranked.size} finalist(s) by ${catalogue.arbitration.formula}. Winner: $winner."
                        } else {
                            "No candidates reached arbitration; decision returned no offer."
                        },
                        candidates,
                        // NOT_RANKED is not a fault: these passed every gate
                        // and were beaten. Identity, not equality — two offers
                        // can be structurally equal.
                        before.filter { b -> candidates.none { it === b } }
                            .map { Denial(it.key, "NOT_RANKED", null) },
                    )
                }

                "switch", "explain-annotate" ->
                    record(node, "${node.label} passed ${before.size} candidate(s) through.", candidates, emptyList())

                else -> throw IllegalArgumentException("Unhandled node type: ${node.type}")
            }
        }

        val winnerOffer = winner?.let { byKey[it] }

        val decision = DeterministicDecision(
            tenantId = request.tenantId,
            artifactId = artifact.id,
            artifactVersion = artifact.version,
            customerRef = request.customerId,
            occurredAt = request.occurredAt,
            channel = request.channel,
            placement = request.placement,
            inputSnapshotHash = inputSnapshotHash,
            catalogueSnapshotHash = catalogueSnapshotHash,
            sourceBindings = sourceBindings.sortedWith(
                compareBy({ it.field }, { it.connectorId }, { it.nodeId })
            ),
            packageVersions = artifact.packageVersions,
            candidateKeys = artifact.candidateKeys,
            eliminations = eliminations,
            scores = scores,
            arbitration = Arbitration(
                catalogue.arbitration.formula,
                UtilityRef(utility.id, utility.version),
                MissingScoreRecord(
                    // Sorted and de-duplicated, matching the TypeScript engine:
                    // a candidate cannot fall back twice.
                    applied = missingScoreApplied.distinct().sorted(),
                    approved = artifact.missingScoreDefault,
                ),
                winner,
                runnerUp,
            ),
            constraintsApplied = constraintsApplied.distinct().sorted(),
            consentState = consent,
            winner = winner,
            winnerOfferId = winnerOffer?.id,
        )

        // One hash, used twice: the id is a prefix of the chain hash.
        val chainHash = Canonical.hash(Canon.decision(decision))
        return DecisionRecord(id = "dec_${chainHash.take(16)}", decision = decision, chainHash = chainHash)
    }
}
