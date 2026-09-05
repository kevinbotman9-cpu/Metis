package com.metis.service

import com.fasterxml.jackson.databind.JsonNode
import com.metis.canonical.Canonical
import com.metis.engine.CatalogueSnapshot
import com.metis.engine.ContactHistory
import com.metis.engine.DecisionRecord
import com.metis.engine.ExecArtifact
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * What the service knows.
 *
 * Loaded from a JSON file at startup and held in memory. That is genuinely all
 * it is: there is no artifact registry, no database, and a restart loses every
 * trace. Stated plainly because the alternative — a service that looks durable
 * and is not — is how a compliance story quietly becomes false.
 *
 * The raw JSON is kept alongside the decoded model because the catalogue hash
 * is computed from the tree, not from the typed classes. See Json.toValue.
 */
class Store(
    val artifacts: Map<String, LoadedArtifact>,
    val catalogue: CatalogueSnapshot,
    val catalogueHash: String,
) {
    /**
     * Traces of decisions this process made, for replay.
     *
     * Concurrent because the HTTP server is thread-per-request. Unbounded,
     * which is fine for a process that loses everything on restart and would
     * not be if it did not.
     */
    private val traces = ConcurrentHashMap<String, StoredDecision>()

    fun remember(
        trace: DecisionRecord,
        artifactId: String,
        input: Map<String, Any?>,
        contactHistory: ContactHistory?,
    ) {
        traces[trace.id] = StoredDecision(trace, artifactId, input, contactHistory)
    }

    fun recall(id: String): StoredDecision? = traces[id]

    fun decisionCount(): Int = traces.size

    companion object {
        /**
         * Load from a bundle: `{ artifacts: [...], catalogue: {...} }`.
         *
         * The same shapes the TypeScript engine executes, so a bundle exported
         * from the console runs here unchanged. That is the point of having a
         * spec rather than two conventions.
         */
        fun load(file: File): Store {
            require(file.exists()) { "Bundle not found: ${file.absolutePath}" }
            val root: JsonNode = Json.mapper.readTree(file)

            val catalogueNode = root["catalogue"]
                ?: error("Bundle has no `catalogue`: ${file.absolutePath}")
            val catalogue = Json.catalogue(catalogueNode)
            val catalogueHash = Canonical.hash(Json.toValue(catalogueNode))

            val artifacts = (root["artifacts"] ?: error("Bundle has no `artifacts`"))
                .associate { node ->
                    val artifact = Json.artifact(node)
                    artifact.id to LoadedArtifact(artifact)
                }
            require(artifacts.isNotEmpty()) { "Bundle contains no artifacts" }

            return Store(artifacts, catalogue, catalogueHash)
        }
    }
}

data class LoadedArtifact(val artifact: ExecArtifact)

/**
 * A decision, with what it needs to be replayed.
 *
 * The input is kept because replay re-executes against the *recorded* snapshot
 * — never against a fresh read, and never by calling an integration again. A
 * service that re-resolved on replay would reproduce today's answer rather than
 * the original one, which is the opposite of what replay is for.
 *
 * The contact history is kept for exactly the same reason, and was missing
 * until 2026-09-05. Replay passed `null`, so any decision suppressed by a
 * frequency policy replayed as unsuppressed and reported `identical: false`.
 * The service conformance test did not catch it because it replays the first
 * case in the corpus, and that case happened not to be suppression-dependent
 * until the corpus was regenerated. Contact history is part of what the
 * decision saw; leaving it out makes replay answer a different question.
 */
data class StoredDecision(
    val trace: DecisionRecord,
    val artifactId: String,
    val input: Map<String, Any?>,
    val contactHistory: ContactHistory?,
)
