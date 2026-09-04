package com.metis.service

import com.fasterxml.jackson.databind.node.ObjectNode
import com.metis.canonical.Canonical
import com.metis.engine.*
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.util.concurrent.Executors

/**
 * The JVM decision service.
 *
 * Serves the same operations as `docs/metis-api.openapi.yaml`, backed by the
 * Kotlin engine. Its reason to exist is that a decision made here carries the
 * same chain hash as the same decision made by the TypeScript engine — which
 * `ServiceConformanceTest` asserts by pushing 60 of the console's real
 * decisions through HTTP and comparing.
 *
 * Built on `com.sun.net.httpserver`, which is in the JDK. That keeps the
 * service dependency-light and is honest about what this is: thread-per-request
 * and not a high-throughput front end. The engine sustains a few thousand
 * decisions per second per core; this server will be the limit long before the
 * engine is, and swapping it for Netty or Ktor changes nothing about the
 * decisions it produces.
 */
class DecisionService(private val store: Store, port: Int = 0) {

    private val server: HttpServer = HttpServer.create(InetSocketAddress(port), 0)

    val boundPort: Int get() = server.address.port

    init {
        server.executor = Executors.newFixedThreadPool(
            maxOf(2, Runtime.getRuntime().availableProcessors())
        )
        server.createContext("/health", ::health)
        server.createContext("/api/decisions", ::decisions)
    }

    fun start() = server.start()

    /** `delaySeconds` 0 so tests do not wait on a graceful drain. */
    fun stop() = server.stop(0)

    // --- Routes ---------------------------------------------------------------

    private fun health(exchange: HttpExchange) = handle(exchange) {
        if (exchange.requestMethod != "GET") throw MethodNotAllowed()
        val body = Json.mapper.createObjectNode()
        body.put("status", "ok")
        body.put("engine", "kotlin")
        body.put("artifacts", store.artifacts.size)
        body.put("catalogueSnapshotHash", store.catalogueHash)
        body.put("decisionsThisProcess", store.decisionCount())
        200 to body
    }

    private fun decisions(exchange: HttpExchange) = handle(exchange) {
        val path = exchange.requestURI.path.removePrefix("/api/decisions").trim('/')
        val segments = if (path.isEmpty()) emptyList() else path.split("/")

        when {
            // POST /api/decisions — make a decision
            segments.isEmpty() && exchange.requestMethod == "POST" -> execute(exchange)

            // GET /api/decisions/{id}/trace
            segments.size == 2 && segments[1] == "trace" && exchange.requestMethod == "GET" ->
                trace(segments[0])

            // POST /api/decisions/{id}/replay
            segments.size == 2 && segments[1] == "replay" && exchange.requestMethod == "POST" ->
                replay(segments[0])

            segments.isEmpty() || segments.size == 2 -> throw MethodNotAllowed()
            else -> throw NotFound("No route for /api/decisions/$path")
        }
    }

    // --- Handlers -------------------------------------------------------------

    private fun execute(exchange: HttpExchange): Pair<Int, ObjectNode> {
        val body = Json.mapper.readTree(exchange.requestBody)
            ?: throw BadRequest("Request body must be JSON")

        // Structure before lookup. The other order answers `{"artifactId":"x"}`
        // with "no artifact x" and says nothing about the missing request body,
        // so the caller fixes one problem at a time.
        val artifactId = body["artifactId"]?.asText()
            ?: throw BadRequest("Missing required field: artifactId")
        val requestNode = body["request"] ?: throw BadRequest("Missing required field: request")
        val request = Json.request(requestNode)

        val loaded = store.artifacts[artifactId]
            ?: throw NotFound("No artifact '$artifactId'. Loaded: ${store.artifacts.keys.sorted()}")

        // Hashed from the raw tree, for the same reason the catalogue is: the
        // typed model omits fields the engine never reads.
        val inputHash = Canonical.hash(Json.toValue(requestNode["input"] ?: Json.mapper.createObjectNode()))

        val trace = Engine.execute(
            artifact = loaded.artifact,
            catalogue = store.catalogue,
            request = request,
            catalogueSnapshotHash = store.catalogueHash,
            inputSnapshotHash = inputHash,
        )
        store.remember(trace, artifactId, request.input)

        return 200 to traceJson(trace)
    }

    private fun trace(id: String): Pair<Int, ObjectNode> {
        val stored = store.recall(id) ?: throw NotFound("No decision with id $id")
        return 200 to traceJson(stored.trace)
    }

    private fun replay(id: String): Pair<Int, ObjectNode> {
        val stored = store.recall(id) ?: throw NotFound("No decision with id $id")
        val loaded = store.artifacts[stored.artifactId]
            ?: throw NotFound("Artifact ${stored.artifactId} is no longer loaded")
        val d = stored.trace.decision

        // Re-executed against the recorded snapshot. No connector is called, no
        // catalogue is re-read: replaying against today's data would reproduce
        // today's answer, not the original one.
        val fresh = Engine.execute(
            artifact = loaded.artifact,
            catalogue = store.catalogue,
            request = DecisionRequest(
                tenantId = d.tenantId,
                customerId = d.customerRef,
                channel = d.channel,
                placement = d.placement,
                occurredAt = d.occurredAt,
                input = stored.input,
                contactHistory = null,
                consent = d.consentState,
            ),
            catalogueSnapshotHash = d.catalogueSnapshotHash,
            inputSnapshotHash = d.inputSnapshotHash,
        )

        val identical = fresh.chainHash == stored.trace.chainHash
        val out = Json.mapper.createObjectNode()
        out.put("identical", identical)
        out.put("decisionId", stored.trace.id)
        out.put("originalChainHash", stored.trace.chainHash)
        out.put("replayedChainHash", fresh.chainHash)
        out.put("originalWinner", d.winner)
        out.put("replayedWinner", fresh.decision.winner)
        out.set<ObjectNode>("differences", Json.mapper.createArrayNode())
        return 200 to out
    }

    // --- Serialisation --------------------------------------------------------

    /**
     * The trace as JSON.
     *
     * Built by re-parsing the canonical form rather than by a second hand-rolled
     * serialiser. One place decides what a decision looks like, and it is the
     * one the hash is taken over — so the body a client reads cannot drift from
     * the bytes that were hashed.
     */
    private fun traceJson(trace: DecisionTrace): ObjectNode {
        val out = Json.mapper.createObjectNode()
        out.put("id", trace.id)
        out.set<ObjectNode>(
            "decision",
            Json.mapper.readTree(Canonical.canonicalise(Canon.decision(trace.decision))) as ObjectNode,
        )
        out.put("chainHash", trace.chainHash)
        // No `measured`: timings are the measured half, excluded from the hash
        // by design, and this service does not claim to produce them.
        return out
    }

    // --- Plumbing -------------------------------------------------------------

    private class NotFound(message: String) : RuntimeException(message)
    private class MethodNotAllowed : RuntimeException("Method not allowed")

    private fun handle(exchange: HttpExchange, block: () -> Pair<Int, ObjectNode>) {
        val (status, body) = try {
            block()
        } catch (e: BadRequest) {
            400 to error("bad_request", e.message ?: "Malformed request")
        } catch (e: NotFound) {
            404 to error("not_found", e.message ?: "Not found")
        } catch (e: MethodNotAllowed) {
            405 to error("method_not_allowed", "${exchange.requestMethod} is not allowed here")
        } catch (e: IllegalArgumentException) {
            // The engine's own guards — a cycle in the graph, a dangling edge.
            // A caller's malformed artifact is a 400, not a 500.
            400 to error("invalid_artifact", e.message ?: "Invalid artifact")
        } catch (e: Exception) {
            500 to error("internal", e.message ?: e::class.simpleName ?: "Unknown error")
        }

        val bytes = Json.mapper.writeValueAsBytes(body)
        exchange.responseHeaders.add("Content-Type", "application/json; charset=utf-8")
        exchange.sendResponseHeaders(status, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }

    private fun error(code: String, message: String): ObjectNode {
        val node = Json.mapper.createObjectNode()
        node.put("error", code)
        node.put("message", message)
        return node
    }
}
