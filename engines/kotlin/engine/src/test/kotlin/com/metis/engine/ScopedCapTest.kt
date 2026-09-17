package com.metis.engine

import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

/**
 * A cap scoped narrower than the tenant is held to the contacts about its scope.
 * ADR-021 §9. The corpus case holds both engines to the same decision; these name
 * the refusal, which the corpus cannot carry, the same way
 * `packages/runtime/tests/contacts-read.test.ts` does.
 */
class ScopedCapTest {
    private val corpus = DecisionConformanceTest()

    private fun run(artifact: ExecArtifact, catalogue: CatalogueSnapshot, request: DecisionRequest) =
        Engine.execute(artifact, catalogue, request, catalogueSnapshotHash = "unused", inputSnapshotHash = "unused")

    private fun scopedCase() =
        corpus.caseNamed("a cap scoped to an offer counts the contacts about that offer, not the channel’s")

    @Test
    fun `a read missing a scoped cap's count is refused`() {
        val (artifact, catalogue, request) = scopedCase()
        val read = request.contactsRead!!
        val missing = request.copy(contactsRead = read.copy(scoped = read.scoped!!.filterKeys { it != "cp_offer_c" }))
        val error = assertFailsWith<IllegalArgumentException> { run(artifact, catalogue, missing) }
        assertTrue(error.message!!.contains("the scoped caps on \"web\" are [cp_offer_b, cp_offer_c]"), error.message)

        val unscoped = request.copy(contactsRead = read.copy(scoped = null))
        assertFailsWith<IllegalArgumentException> { run(artifact, catalogue, unscoped) }
    }

    @Test
    fun `a read naming a cap the channel does not have is refused`() {
        val (artifact, catalogue, request) = scopedCase()
        val read = request.contactsRead!!
        val extra = request.copy(contactsRead = read.copy(scoped = read.scoped!! + ("cp_nowhere" to ContactCounts(0, 0, 0))))
        val error = assertFailsWith<IllegalArgumentException> { run(artifact, catalogue, extra) }
        assertTrue(error.message!!.contains("cp_nowhere"), error.message)
    }
}
