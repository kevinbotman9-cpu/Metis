package com.metis.service

import com.fasterxml.jackson.databind.JsonNode
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * The JVM service, reproducing decisions the TypeScript engine made.
 *
 * The value and decision corpora are synthetic — small cases written to isolate
 * one rule each. This is the other kind of evidence: the console's real
 * flows, its real catalogue, and 60 of the decisions its engine actually
 * produced. Same requests, over HTTP, must come back with the same chain hash.
 *
 * That is the claim a JVM deployment rests on. Without it, "the Kotlin engine
 * agrees" would mean "agrees on cases we wrote to be agreed about".
 */
class ServiceConformanceTest {

    private lateinit var service: DecisionService
    private lateinit var store: Store
    private lateinit var cases: JsonNode

    private fun repoFile(relative: String): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, relative)
            if (candidate.exists()) return candidate
            dir = dir.parentFile
        }
        error("$relative not found above ${File("").absolutePath}. Run `npm run corpus` at the root.")
    }

    @BeforeTest
    fun start() {
        store = Store.load(repoFile("docs/conformance/service-bundle.json"))
        cases = Json.mapper.readTree(repoFile("docs/conformance/service-cases.json"))
        // Port 0: the OS picks a free one, so a developer with something on
        // 8081 does not get a mystery failure.
        service = DecisionService(store, port = 0)
        service.start()
    }

    @AfterTest
    fun stop() {
        service.stop()
    }

    // --- HTTP helpers ---------------------------------------------------------

    private fun call(method: String, path: String, body: String? = null): Pair<Int, JsonNode> {
        val url = URI("http://localhost:${service.boundPort}$path").toURL()
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 5_000
        conn.readTimeout = 20_000
        if (body != null) {
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val status = conn.responseCode
        val stream = if (status < 400) conn.inputStream else conn.errorStream
        val text = stream?.use { String(it.readBytes(), Charsets.UTF_8) } ?: ""
        return status to Json.mapper.readTree(text.ifEmpty { "{}" })
    }

    // --- Tests ----------------------------------------------------------------

    @Test
    fun `health reports what the service loaded`() {
        val (status, body) = call("GET", "/health")
        assertEquals(200, status)
        assertEquals("ok", body["status"].asText())
        assertEquals("kotlin", body["engine"].asText())
        assertTrue(body["artifacts"].asInt() > 0, "no artifacts loaded")

        // The catalogue hash is the same one the TypeScript engine stamps into
        // every decision. If this is wrong the bundle did not decode faithfully
        // and every case below would fail for the same uninformative reason.
        val expected = cases["cases"][0]["expected"]["catalogueSnapshotHash"].asText()
        assertEquals(expected, body["catalogueSnapshotHash"].asText(), "catalogue hash differs from the reference")
    }

    @Test
    fun `every real decision reproduces byte for byte`() {
        val failures = mutableListOf<String>()
        var checked = 0
        var offered = 0

        for (case in cases["cases"]) {
            val expected = case["expected"]
            val payload = Json.mapper.createObjectNode()
            payload.put("artifactId", case["artifactId"].asText())
            payload.set<JsonNode>("request", case["request"])

            val (status, body) = call("POST", "/api/decisions", Json.mapper.writeValueAsString(payload))
            if (status != 200) {
                failures += "${expected["id"].asText()}: HTTP $status ${body["message"]?.asText() ?: ""}"
                continue
            }

            val actualHash = body["chainHash"].asText()
            if (actualHash != expected["chainHash"].asText()) {
                failures += buildString {
                    append("${expected["id"].asText()}: chain hash differs\n")
                    append("    winner   expected ${expected["winner"]} got ${body["decision"]["winner"]}\n")
                    append("    input    expected ${expected["inputSnapshotHash"].asText().take(16)} " +
                        "got ${body["decision"]["inputSnapshotHash"].asText().take(16)}\n")
                    append("    catalogue expected ${expected["catalogueSnapshotHash"].asText().take(16)} " +
                        "got ${body["decision"]["catalogueSnapshotHash"].asText().take(16)}")
                }
                continue
            }

            assertEquals(expected["id"].asText(), body["id"].asText(), "id is not the chain hash prefix")
            if (!expected["winner"].isNull) offered++
            checked++
        }

        if (failures.isNotEmpty()) {
            fail("${failures.size} of ${cases["cases"].size()} decisions diverge:\n\n" + failures.take(10).joinToString("\n\n"))
        }
        assertEquals(cases["cases"].size(), checked, "not every case was compared")

        // A run where nothing was ever offered would pass the hash check while
        // exercising none of the scoring or arbitration.
        assertTrue(offered > 0, "no decision produced an offer; the sample is not exercising arbitration")
        assertTrue(offered < checked, "every decision produced an offer; suppression is untested")
    }

    /**
     * Every case, not the first one.
     *
     * This test used to replay `cases[0]` alone, and passed while the service
     * threw away the contact history it was given: replay re-executed with
     * `null`, so a decision suppressed by a frequency policy replayed as
     * unsuppressed. It stayed green only because the case that happened to be
     * first did not depend on suppression. Regenerating the corpus reordered
     * the cases and the bug surfaced immediately — which is an argument for
     * covering the whole corpus rather than for regenerating more often.
     */
    @Test
    fun `every decision can be fetched and replayed`() {
        var offered = 0
        var suppressed = 0
        var withHistory = 0

        for (case in cases["cases"]) {
            val payload = Json.mapper.createObjectNode()
            payload.put("artifactId", case["artifactId"].asText())
            payload.set<JsonNode>("request", case["request"])

            val (_, decision) = call("POST", "/api/decisions", Json.mapper.writeValueAsString(payload))
            val id = decision["id"].asText()

            val (traceStatus, trace) = call("GET", "/api/decisions/$id/trace")
            assertEquals(200, traceStatus)
            assertEquals(decision["chainHash"].asText(), trace["chainHash"].asText())

            val (replayStatus, replay) = call("POST", "/api/decisions/$id/replay")
            assertEquals(200, replayStatus)
            assertTrue(replay["identical"].asBoolean(), "replay did not reproduce decision $id")
            assertEquals(decision["chainHash"].asText(), replay["replayedChainHash"].asText())

            if (case["expected"]["winner"].isNull) suppressed++ else offered++
            if (case["request"].has("contactHistory")) withHistory++
        }

        // Without these the loop above could pass over sixty decisions that
        // were all the same shape, which is how the single-case version of
        // this test stayed green through a real bug.
        assertTrue(offered > 0, "no replayed decision produced an offer")
        assertTrue(suppressed > 0, "no replayed decision was suppressed")
        assertTrue(withHistory > 0, "no replayed decision carried contact history")
    }

    @Test
    fun `the response body is the bytes that were hashed`() {
        // The trace JSON is produced by re-parsing the canonical form, so what a
        // client reads cannot drift from what was hashed. Checked by hashing the
        // body's decision back and comparing.
        val case = cases["cases"][0]
        val payload = Json.mapper.createObjectNode()
        payload.put("artifactId", case["artifactId"].asText())
        payload.set<JsonNode>("request", case["request"])

        val (_, body) = call("POST", "/api/decisions", Json.mapper.writeValueAsString(payload))
        val rehashed = com.metis.canonical.Canonical.hash(Json.toValue(body["decision"]))
        assertEquals(body["chainHash"].asText(), rehashed, "the body does not hash to the chain hash it reports")
    }

    // --- Failure behaviour ----------------------------------------------------

    @Test
    fun `an unknown artifact is 404, not 500`() {
        // A well-formed request naming a real-looking artifact: structure is
        // validated first, so this reaches the lookup rather than short-
        // circuiting on the body.
        val payload = Json.mapper.createObjectNode()
        payload.put("artifactId", "art_does_not_exist")
        payload.set<JsonNode>("request", cases["cases"][0]["request"])

        val (status, body) = call("POST", "/api/decisions", Json.mapper.writeValueAsString(payload))
        assertEquals(404, status)
        assertEquals("not_found", body["error"].asText())
        // The message should say what is loaded, or the caller is guessing.
        assertTrue(body["message"].asText().contains("art_"), "404 does not name the loaded artifacts")
    }

    @Test
    fun `a malformed request is 400, not 500`() {
        val (status, body) = call("POST", "/api/decisions", """{"artifactId":"x"}""")
        assertEquals(400, status)
        assertEquals("bad_request", body["error"].asText())
        assertTrue(body["message"].asText().contains("request"), "400 does not name the missing field")
    }

    @Test
    fun `a request with no occurredAt is refused rather than defaulted`() {
        // Defaulting to `now` would make a decision depend on when it was made
        // and quietly break replay. Better to refuse.
        val request = (cases["cases"][0]["request"] as com.fasterxml.jackson.databind.node.ObjectNode).deepCopy()
        request.remove("occurredAt")
        val payload = Json.mapper.createObjectNode()
        payload.put("artifactId", cases["cases"][0]["artifactId"].asText())
        payload.set<JsonNode>("request", request)

        val (status, body) = call("POST", "/api/decisions", Json.mapper.writeValueAsString(payload))
        assertEquals(400, status)
        assertTrue(body["message"].asText().contains("occurredAt"), "400 does not name occurredAt")
    }

    @Test
    fun `replaying an unknown decision is 404`() {
        val (status, _) = call("POST", "/api/decisions/dec_nope/replay")
        assertEquals(404, status)
    }

    @Test
    fun `the wrong method is 405`() {
        val (status, _) = call("GET", "/api/decisions")
        assertEquals(405, status)
    }
}
