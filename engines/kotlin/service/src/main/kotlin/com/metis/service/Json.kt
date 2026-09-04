package com.metis.service

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.JsonNodeType
import com.metis.canonical.Canonical.Value
import com.metis.engine.*

/**
 * JSON in, domain out.
 *
 * This lives in :service rather than :engine on purpose. The engine's build
 * has no runtime dependencies, so a JSON library cannot reach the hashing
 * path — see engine/build.gradle.kts. Parsing a request body is a transport
 * concern and belongs here.
 *
 * Note what `toValue` is for. Catalogue and input hashes are computed from the
 * raw JSON tree, not from the typed model, because the typed model deliberately
 * omits fields the engine never reads. Rebuilding the exact key set from it
 * would make a hash depend on how faithfully this port modelled metadata it
 * does not use. It also catches a decoder that read a number differently from
 * the reference: the hash fails before anything else can go wrong.
 */
object Json {

    val mapper: ObjectMapper = ObjectMapper()

    // --- Raw tree to canonical value ----------------------------------------

    fun toValue(node: JsonNode): Value = when (node.nodeType) {
        JsonNodeType.NULL -> Value.Null
        JsonNodeType.BOOLEAN -> Value.Bool(node.asBoolean())
        JsonNodeType.NUMBER -> Value.Num(node.asDouble())
        JsonNodeType.STRING -> Value.Str(node.asText())
        JsonNodeType.ARRAY -> Value.Arr(node.map { toValue(it) })
        JsonNodeType.OBJECT -> Value.Obj(node.properties().map { (k, v) -> k to toValue(v) })
        else -> throw BadRequest("Unsupported JSON node: ${node.nodeType}")
    }

    // --- Raw tree to plain Kotlin -------------------------------------------

    fun plain(node: JsonNode?): Any? = when {
        node == null || node.isNull -> null
        node.isBoolean -> node.asBoolean()
        // One number type, matching JSON and matching the reference, so a
        // policy comparing 24 to 24.0 does not depend on how it was written.
        node.isNumber -> node.asDouble()
        node.isTextual -> node.asText()
        node.isArray -> node.map { plain(it) }
        node.isObject -> node.properties().associate { (k, v) -> k to plain(v) }
        else -> throw BadRequest("Unsupported JSON node: $node")
    }

    // --- Domain decoding ------------------------------------------------------

    private fun req(node: JsonNode?, what: String): JsonNode =
        node ?: throw BadRequest("Missing required field: $what")

    private fun scope(n: JsonNode) = PolicyScope(
        level = req(n["level"], "scope.level").asText(),
        targetId = n["targetId"]?.takeIf { !it.isNull }?.asText(),
    )

    private fun validity(n: JsonNode?): ValidityWindow? =
        n?.takeIf { !it.isNull }?.let {
            ValidityWindow(
                req(it["startsAt"], "validity.startsAt").asText(),
                it["endsAt"]?.takeIf { e -> !e.isNull }?.asText(),
            )
        }

    fun proposition(n: JsonNode) = Proposition(
        id = req(n["id"], "proposition.id").asText(),
        groupId = req(n["groupId"], "proposition.groupId").asText(),
        issueId = req(n["issueId"], "proposition.issueId").asText(),
        key = req(n["key"], "proposition.key").asText(),
        status = req(n["status"], "proposition.status").asText(),
        financials = Financials(
            Money(
                req(n["financials"]?.get("expectedMargin")?.get("amount"), "expectedMargin.amount").asDouble(),
                n["financials"]["expectedMargin"]["currency"]?.asText() ?: "GBP",
            )
        ),
        validity = validity(n["validity"]) ?: throw BadRequest("proposition.validity is required"),
        lever = req(n["lever"], "proposition.lever").asDouble(),
        policyIds = n["policyIds"]?.map { it.asText() } ?: emptyList(),
    )

    fun catalogue(n: JsonNode) = CatalogueSnapshot(
        propositions = req(n["propositions"], "catalogue.propositions").map { proposition(it) },
        engagementPolicies = (n["engagementPolicies"] ?: mapper.createArrayNode()).map { p ->
            EngagementPolicy(
                id = req(p["id"], "policy.id").asText(),
                kind = req(p["kind"], "policy.kind").asText(),
                conditions = (p["conditions"] ?: mapper.createArrayNode()).map {
                    PolicyCondition(
                        req(it["field"], "condition.field").asText(),
                        req(it["operator"], "condition.operator").asText(),
                        plain(it["value"]),
                    )
                },
                scope = scope(req(p["scope"], "policy.scope")),
                active = p["active"]?.asBoolean() ?: true,
            )
        },
        contactPolicies = (n["contactPolicies"] ?: mapper.createArrayNode()).map { c ->
            ContactPolicy(
                id = req(c["id"], "contactPolicy.id").asText(),
                channel = c["channel"]?.takeIf { !it.isNull }?.asText(),
                maxContacts = req(c["maxContacts"], "contactPolicy.maxContacts").asDouble(),
                period = req(c["period"], "contactPolicy.period").asText(),
                scope = scope(req(c["scope"], "contactPolicy.scope")),
                active = c["active"]?.asBoolean() ?: true,
            )
        },
        arbitration = ArbitrationConfig(
            weights = req(n["arbitration"]?.get("weights"), "arbitration.weights").let {
                ArbitrationWeights(
                    req(it["propensity"], "weights.propensity").asDouble(),
                    req(it["value"], "weights.value").asDouble(),
                    req(it["lever"], "weights.lever").asDouble(),
                    req(it["context"], "weights.context").asDouble(),
                )
            },
            formula = req(n["arbitration"]?.get("formula"), "arbitration.formula").asText(),
        ),
        levers = (n["levers"] ?: mapper.createArrayNode()).map { l ->
            Lever(
                req(l["id"], "lever.id").asText(),
                scope(req(l["scope"], "lever.scope")),
                req(l["value"], "lever.value").asDouble(),
                validity(l["validity"]),
            )
        },
        connectors = (n["connectors"] ?: mapper.createArrayNode()).map { c ->
            Connector(
                id = req(c["id"], "connector.id").asText(),
                provides = (c["provides"] ?: mapper.createArrayNode()).map {
                    FieldBinding(
                        req(it["field"], "binding.field").asText(),
                        req(it["path"], "binding.path").asText(),
                        it["type"]?.asText() ?: "string",
                    )
                },
                active = c["active"]?.asBoolean() ?: true,
            )
        },
    )

    fun artifact(n: JsonNode) = ExecArtifact(
        id = req(n["id"], "artifact.id").asText(),
        version = req(n["version"], "artifact.version").asText(),
        tenantId = req(n["tenantId"], "artifact.tenantId").asText(),
        nodes = req(n["nodes"], "artifact.nodes").map { node ->
            ExecNode(
                id = req(node["id"], "node.id").asText(),
                type = req(node["type"], "node.type").asText(),
                label = req(node["label"], "node.label").asText(),
                policyIds = node["policyIds"]?.map { it.asText() },
                model = node["model"]?.takeIf { !it.isNull }?.let {
                    Model(req(it["id"], "model.id").asText(), req(it["version"], "model.version").asText())
                },
                contactPolicyIds = node["contactPolicyIds"]?.map { it.asText() },
                connectorIds = node["connectorIds"]?.map { it.asText() },
            )
        },
        edges = (n["edges"] ?: mapper.createArrayNode()).map {
            ExecEdge(req(it["from"], "edge.from").asText(), req(it["to"], "edge.to").asText())
        },
        candidateKeys = (n["candidateKeys"] ?: mapper.createArrayNode()).map { it.asText() },
        packageVersions = (n["packageVersions"] ?: mapper.createObjectNode())
            .properties().associate { (k, v) -> k to v.asText() },
    )

    @Suppress("UNCHECKED_CAST")
    fun request(n: JsonNode) = DecisionRequest(
        tenantId = req(n["tenantId"], "request.tenantId").asText(),
        customerId = req(n["customerId"], "request.customerId").asText(),
        channel = req(n["channel"], "request.channel").asText(),
        placement = req(n["placement"], "request.placement").asText(),
        // An input, never the clock. A service that defaulted this to `now`
        // would make replay depend on when the replay happened.
        occurredAt = req(n["occurredAt"], "request.occurredAt").asText(),
        input = (plain(n["input"]) as? Map<String, Any?>) ?: emptyMap(),
        contactHistory = n["contactHistory"]?.takeIf { !it.isNull }?.let {
            ContactHistory(
                req(it["channel"], "contactHistory.channel").asText(),
                (it["withinPeriod"] ?: mapper.createObjectNode())
                    .properties().associate { (k, v) -> k to v.asDouble() },
            )
        },
        consent = n["consent"]?.takeIf { !it.isNull }?.let {
            Consent(
                it["marketing"]?.asBoolean() ?: true,
                it["profiling"]?.asBoolean() ?: true,
                it["thirdParty"]?.asBoolean() ?: false,
            )
        },
    )
}

/** A malformed request. Answered 400, never 500. */
class BadRequest(message: String) : IllegalArgumentException(message)
