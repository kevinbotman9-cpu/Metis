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

    /** The offer's record as plain values, for conditions that read the candidate. ADR-017 §3. */
    @Suppress("UNCHECKED_CAST")
    private fun rawOf(n: JsonNode): Map<String, Any?> = plain(n) as Map<String, Any?>

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
        // What an `offer.*` condition reads. ADR-017 §3.
        raw = rawOf(n),
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
                cooldownDaysAfterReject = c["cooldownDaysAfterReject"]?.asDouble() ?: 0.0,
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
        schema = n["schema"]?.let {
            SchemaPin(it["id"].asText(), it["version"].asText(), it["hash"].asText())
        },
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
                it["rejects"]?.takeIf { r -> !r.isNull }
                    ?.properties()?.associate { (k, v) -> k to v.asText() },
            )
        },
        // A purpose missing from the case is unstated, exactly as a caller's would be.
        consent = n["consent"]?.takeIf { !it.isNull }?.let {
            Consent(
                it["marketing"]?.takeIf { v -> !v.isNull }?.asBoolean(),
                it["profiling"]?.takeIf { v -> !v.isNull }?.asBoolean(),
                it["thirdParty"]?.takeIf { v -> !v.isNull }?.asBoolean(),
            )
        },
        // ADR-021. Set by a resolving service in production; a corpus case
        // carries it on the request so both engines are held to what they
        // record and suppress with it.
        contactsRead = n["contactsRead"]?.takeIf { !it.isNull }?.let {
            ContactsRead(
                it["status"].asText(),
                it["channel"].asText(),
                it["withinPeriod"]?.takeIf { w -> !w.isNull }?.let { w ->
                    ContactCounts(w["day"].asLong(), w["week"].asLong(), w["month"].asLong())
                },
                it["scoped"]?.takeIf { s -> !s.isNull }?.let { s ->
                    s.fields().asSequence().associate { (id, w) ->
                        id to ContactCounts(w["day"].asLong(), w["week"].asLong(), w["month"].asLong())
                    }
                },
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

    /**
     * G-015, named. The corpus cases below already hold this to the bytes; this
     * says which rule broke rather than only which hashes. A flow with no
     * constraint node before ranking has consent applied by the platform, once,
     * before ranking — and a constraint node after ranking does not stand in.
     */
    @Test
    fun `a flow with no constraint node has consent applied by the platform, before ranking`() {
        for (name in listOf(
            "consent is applied to a flow with no constraint node",
            "absent consent is applied to a flow with no constraint node",
            "a constraint node after ranking does not stand in for consent",
        )) {
            val steps = decide(name).eliminations
            val consent = steps.filter { it.nodeId == Engine.CONSENT_STEP_ID }
            assertEquals(1, consent.size, "$name: the platform applied consent ${consent.size} times")
            assertEquals("consent", consent[0].nodeType, name)
            assertEquals(listOf("offer_b", "offer_c"), consent[0].denials.map { it.key }, name)
            assertTrue(steps.indexOf(consent[0]) < steps.indexOfFirst { it.nodeType == "arbitrate" }, "$name: ranked before consent")
        }
    }

    @Test
    fun `a flow whose constraint node applies consent records no platform step`() {
        val steps = decide("withheld consent leaves only service-exempt scopes").eliminations
        assertTrue(steps.none { it.nodeId == Engine.CONSENT_STEP_ID })
        assertTrue(steps.any { s -> s.nodeType == "constraint" && s.denials.any { it.code == "CONSENT_WITHHELD" } })
    }

    /** A corpus case as the engine takes it, for a test that alters the request before executing. */
    internal fun caseNamed(name: String): Triple<ExecArtifact, CatalogueSnapshot, DecisionRequest> {
        val case = corpus["cases"].firstOrNull { it["name"].asText() == name }
            ?: fail("the decision corpus has no case named '$name'")
        return Triple(artifact(case["artifact"]), catalogue(case["catalogue"]), request(case["request"]))
    }

    private fun decide(name: String): DeterministicDecision {
        val case = corpus["cases"].firstOrNull { it["name"].asText() == name }
            ?: fail("the decision corpus has no case named '$name'")
        return Engine.execute(
            artifact(case["artifact"]),
            catalogue(case["catalogue"]),
            request(case["request"]),
            catalogueSnapshotHash = Canonical.hash(toValue(case["catalogue"])),
            inputSnapshotHash = Canonical.hash(toValue(case["request"]["input"])),
        ).decision
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
