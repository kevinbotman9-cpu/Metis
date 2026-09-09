package com.metis.engine

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.JsonNodeType
import com.metis.canonical.Canonical
import com.metis.canonical.Canonical.Value
import com.metis.Corpus
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * The Kotlin engine, held to the TypeScript engine's output.
 *
 * `ConformanceTest` proves the two agree on how to hash a value. This proves
 * they agree on what a decision *is*: same artifact, same catalogue, same
 * request, same eliminations, same scores, same winner, same chain hash.
 *
 * Every expectation comes from the corpus, which is generated from the
 * reference. Nothing here can define anything — only agree or disagree.
 */
class DecisionConformanceTest {

    private val mapper = ObjectMapper()
    private val corpus: JsonNode = mapper.readTree(Corpus.file("decision-corpus.json"))

    // --- JSON to canonical value ---------------------------------------------

    /**
     * Convert a raw JSON tree into a canonical value.
     *
     * This is how the catalogue and input hashes are computed, rather than from
     * the typed model. The typed model omits fields the engine never reads, and
     * rebuilding the exact key set from it would make a hash depend on how
     * faithfully the port modelled display metadata — which has nothing to do
     * with decisioning.
     *
     * It also doubles as a check on the decoder: if Jackson parsed a number
     * differently from V8, the catalogue hash will not match and the test says
     * so before anything else has a chance to go wrong.
     */
    private fun toValue(node: JsonNode): Value = when (node.nodeType) {
        JsonNodeType.NULL -> Value.Null
        JsonNodeType.BOOLEAN -> Value.Bool(node.asBoolean())
        JsonNodeType.NUMBER -> Value.Num(node.asDouble())
        JsonNodeType.STRING -> Value.Str(node.asText())
        JsonNodeType.ARRAY -> Value.Arr(node.map { toValue(it) })
        JsonNodeType.OBJECT ->
            Value.Obj(node.properties().map { (k, v) -> k to toValue(v) })
        else -> fail("Unexpected JSON node type: ${node.nodeType}")
    }

    // --- JSON to domain -------------------------------------------------------

    private fun plain(node: JsonNode?): Any? = when {
        node == null || node.isNull -> null
        node.isBoolean -> node.asBoolean()
        node.isNumber -> node.asDouble()
        node.isTextual -> node.asText()
        node.isArray -> node.map { plain(it) }
        node.isObject -> node.properties().associate { (k, v) -> k to plain(v) }
        else -> fail("Unexpected node: $node")
    }

    private fun scope(n: JsonNode) = PolicyScope(
        level = n["level"].asText(),
        targetId = n["targetId"].takeIf { !it.isNull }?.asText(),
    )

    private fun validity(n: JsonNode?) = n?.takeIf { !it.isNull }?.let {
        ValidityWindow(it["startsAt"].asText(), it["endsAt"].takeIf { e -> !e.isNull }?.asText())
    }

    private fun offer(n: JsonNode) = Offer(
        id = n["id"].asText(),
        categoryId = n["categoryId"].asText(),
        objectiveId = n["objectiveId"].asText(),
        key = n["key"].asText(),
        status = n["status"].asText(),
        financials = Financials(
            Money(
                n["financials"]["expectedMargin"]["amount"].asDouble(),
                n["financials"]["expectedMargin"]["currency"].asText(),
            ),
            Money(
                n["financials"]["cost"]["amount"].asDouble(),
                n["financials"]["cost"]["currency"].asText(),
            ),
        ),
        validity = validity(n["validity"])!!,
        boost = n["boost"].asDouble(),
        policyIds = n["policyIds"].map { it.asText() },
    )

    private fun catalogue(n: JsonNode) = CatalogueSnapshot(
        offers = n["offers"].map { offer(it) },
        targetingPolicies = n["targetingPolicies"].map { p ->
            TargetingPolicy(
                id = p["id"].asText(),
                kind = p["kind"].asText(),
                conditions = p["conditions"].map {
                    PolicyCondition(it["field"].asText(), it["operator"].asText(), plain(it["value"]))
                },
                scope = scope(p["scope"]),
                active = p["active"].asBoolean(),
            )
        },
        frequencyPolicies = n["frequencyPolicies"].map { c ->
            FrequencyPolicy(
                id = c["id"].asText(),
                channel = c["channel"].takeIf { !it.isNull }?.asText(),
                maxContacts = c["maxContacts"].asDouble(),
                period = c["period"].asText(),
                scope = scope(c["scope"]),
                active = c["active"].asBoolean(),
            )
        },
        arbitration = ArbitrationConfig(
            weights = n["arbitration"]["weights"].let {
                ArbitrationWeights(
                    it["propensity"].asDouble(),
                    it["value"].asDouble(),
                    it["boost"].asDouble(),
                    it["context"].asDouble(),
                )
            },
            utility = n["arbitration"]["utility"].let {
                UtilityRef(it["id"].asText(), it["version"].asText())
            },
            formula = n["arbitration"]["formula"].asText(),
        ),
        boosts = n["boosts"].map { l ->
            Boost(l["id"].asText(), scope(l["scope"]), l["value"].asDouble(), validity(l["validity"]))
        },
        connectors = (n["connectors"] ?: mapper.createArrayNode()).map { c ->
            Connector(
                id = c["id"].asText(),
                provides = c["provides"].map {
                    FieldBinding(it["field"].asText(), it["path"].asText(), it["type"].asText())
                },
                active = c["active"].asBoolean(),
            )
        },
    )

    private fun artifact(n: JsonNode) = ExecArtifact(
        id = n["id"].asText(),
        version = n["version"].asText(),
        tenantId = n["tenantId"].asText(),
        nodes = n["nodes"].map { node ->
            ExecNode(
                id = node["id"].asText(),
                type = node["type"].asText(),
                label = node["label"].asText(),
                policyIds = node["policyIds"]?.map { it.asText() },
                model = node["model"]?.let { Model(it["id"].asText(), it["version"].asText()) },
                frequencyPolicyIds = node["frequencyPolicyIds"]?.map { it.asText() },
                connectorIds = node["connectorIds"]?.map { it.asText() },
            )
        },
        edges = n["edges"].map { ExecEdge(it["from"].asText(), it["to"].asText()) },
        candidateKeys = n["candidateKeys"].map { it.asText() },
        packageVersions = n["packageVersions"].properties().associate { (k, v) -> k to v.asText() },
        missingScoreDefault = n["missingScoreDefault"]?.let {
            MissingScoreDefault(
                propensity = it["propensity"].asDouble(),
                context = it["context"].asDouble(),
                approvedBy = it["approvedBy"].asText(),
                approvedAt = it["approvedAt"].asText(),
            )
        },
    )

    @Suppress("UNCHECKED_CAST")
    private fun request(n: JsonNode) = DecisionRequest(
        tenantId = n["tenantId"].asText(),
        customerId = n["customerId"].asText(),
        channel = n["channel"].asText(),
        placement = n["placement"].asText(),
        occurredAt = n["occurredAt"].asText(),
        input = plain(n["input"]) as Map<String, Any?>,
        contactHistory = n["contactHistory"]?.let {
            ContactHistory(
                it["channel"].asText(),
                it["withinPeriod"].properties().associate { (k, v) -> k to v.asDouble() },
            )
        },
        consent = n["consent"]?.let {
            Consent(
                it["marketing"].asBoolean(),
                it["profiling"].asBoolean(),
                it["thirdParty"].asBoolean(),
            )
        },
    )

    // --- The test -------------------------------------------------------------

    @Test
    fun `corpus is present and every decision is distinct`() {
        val cases = corpus["cases"]
        assertTrue(cases.size() >= 20, "corpus is suspiciously small: ${cases.size()}")
        val hashes = cases.map { it["expected"]["chainHash"].asText() }.toSet()
        assertEquals(cases.size(), hashes.size, "two cases produce the same decision")
    }

    @Test
    fun `every decision matches the reference engine`() {
        val failures = mutableListOf<String>()
        var checked = 0

        for (case in corpus["cases"]) {
            val name = case["name"].asText()
            val expected = case["expected"]

            // Hashes of the raw trees, which is also the check that Jackson and
            // V8 read the same numbers out of the same JSON.
            val catalogueHash = Canonical.hash(toValue(case["catalogue"]))
            val inputHash = Canonical.hash(toValue(case["request"]["input"]))

            if (catalogueHash != expected["catalogueSnapshotHash"].asText()) {
                failures += "$name: catalogue hash differs — the corpus did not decode faithfully"
                continue
            }
            if (inputHash != expected["inputSnapshotHash"].asText()) {
                failures += "$name: input snapshot hash differs — the corpus did not decode faithfully"
                continue
            }

            val trace = try {
                Engine.execute(
                    artifact(case["artifact"]),
                    catalogue(case["catalogue"]),
                    request(case["request"]),
                    catalogueSnapshotHash = catalogueHash,
                    inputSnapshotHash = inputHash,
                )
            } catch (e: Exception) {
                failures += "$name: threw ${e::class.simpleName}: ${e.message}"
                continue
            }

            if (trace.chainHash == expected["chainHash"].asText()) {
                assertEquals(expected["id"].asText(), trace.id, "$name: id is not the hash prefix")
                checked++
                continue
            }

            // A hash mismatch on its own says nothing useful, so diff the
            // reproducible half field by field and report the first divergence.
            failures += "$name:\n" + describeDivergence(expected["decision"], trace.decision)
        }

        if (failures.isNotEmpty()) {
            fail("${failures.size} of ${corpus["cases"].size()} decisions diverge:\n\n" + failures.joinToString("\n\n"))
        }
        assertEquals(corpus["cases"].size(), checked, "not every case was compared")
    }

    /** Where the two decisions differ, as a readable list. */
    private fun describeDivergence(expected: JsonNode, actual: DeterministicDecision): String {
        val actualTree = mapper.readTree(canonicalJson(Canon.decision(actual)))
        val diffs = mutableListOf<String>()
        walk("", expected, actualTree, diffs)
        return if (diffs.isEmpty()) {
            "  chain hash differs but no field does — the canonical form of a field must differ in a way JSON does not show"
        } else {
            diffs.take(8).joinToString("\n") { "  $it" }
        }
    }

    private fun canonicalJson(v: Value): String = Canonical.canonicalise(v)

    private fun walk(path: String, a: JsonNode, b: JsonNode?, out: MutableList<String>) {
        if (b == null) {
            out += "$path: missing in the Kotlin decision"
            return
        }
        if (a.isObject && b.isObject) {
            for ((k, v) in a.properties()) walk("$path.$k", v, b[k], out)
            for ((k, _) in b.properties()) if (a[k] == null) out += "$path.$k: present only in Kotlin"
            return
        }
        if (a.isArray && b.isArray) {
            if (a.size() != b.size()) {
                out += "$path: length ${a.size()} vs ${b.size()}"
                return
            }
            for (i in 0 until a.size()) walk("$path[$i]", a[i], b[i], out)
            return
        }
        if (a.toString() != b.toString()) out += "$path: expected ${a} but got ${b}"
    }
}
