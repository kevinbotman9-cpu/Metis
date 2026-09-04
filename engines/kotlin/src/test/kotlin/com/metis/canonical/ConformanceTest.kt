package com.metis.canonical

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlin.test.fail

/**
 * The Kotlin implementation, held to the TypeScript reference's output.
 *
 * Same corpus file, same 67 cases, same expected bytes. If this passes and
 * `packages/runtime/tests/conformance.test.ts` passes, then a decision hashed
 * by either engine carries the same chain hash — which is the whole basis for
 * having two engines at all.
 *
 * Nothing here is generated from the Kotlin side. The expectations come from
 * the reference, so this can only ever prove agreement, never define it.
 */
class ConformanceTest {

    private val corpus: JsonNode = ObjectMapper().readTree(
        // The test runs from engines/kotlin; the corpus is repository-level,
        // shared with the TypeScript suite rather than copied.
        File("../../docs/conformance/canonical-corpus.json").also {
            assertTrue(it.exists(), "Corpus not found at ${it.absolutePath}. Run: npm run corpus")
        }
    )

    /**
     * Decode the transport encoding described in
     * scripts/build-conformance-corpus.mjs.
     *
     * Numbers arrive as IEEE-754 bits and strings as UTF-16 code units, so
     * nothing depends on Jackson agreeing with V8 about how to parse a literal.
     * That matters: if the corpus carried `1e21` as a JSON number, this test
     * would be checking Jackson's parser as much as our canonicaliser.
     */
    private fun decode(node: JsonNode): Canonical.Value = when (val tag = node["t"].asText()) {
        "null" -> Canonical.Value.Null
        "undefined" -> Canonical.Value.Absent
        "bool" -> Canonical.Value.Bool(node["v"].asBoolean())
        "num" -> Canonical.Value.Num(
            java.lang.Double.longBitsToDouble(node["bits"].asText().toULong(16).toLong())
        )
        "str" -> Canonical.Value.Str(fromUnits(node["units"]))
        "arr" -> Canonical.Value.Arr(node["items"].map { decode(it) })
        "obj" -> Canonical.Value.Obj(
            node["members"].map { fromUnits(it["key"]) to decode(it["value"]) }
        )
        // A function, symbol or bigint has no Kotlin equivalent and no reason to
        // acquire one: the model in Canonical.Value has no way to express them,
        // which is the type system enforcing what the TS version enforces at
        // run time. Those cases are skipped, and the count is asserted below so
        // the skip cannot quietly grow.
        "unsupported" -> throw UnsupportedInKotlin(node["kind"].asText())
        else -> fail("Unknown corpus tag: $tag")
    }

    private class UnsupportedInKotlin(val kind: String) : RuntimeException(kind)

    /** Rebuild a string from UTF-16 code units, lone surrogates included. */
    private fun fromUnits(units: JsonNode): String {
        val sb = StringBuilder(units.size())
        for (u in units) sb.append(u.asInt().toChar())
        return sb.toString()
    }

    @Test
    fun `corpus is present and covers both outcomes`() {
        assertEquals("sha256", corpus["algorithm"].asText())
        assertEquals("utf-8", corpus["encoding"].asText())
        assertTrue(corpus["cases"].size() > 50, "corpus is suspiciously small")
        assertTrue(corpus["cases"].any { it.has("throws") })
    }

    @Test
    fun `every case matches the reference implementation`() {
        val failures = mutableListOf<String>()
        var checked = 0
        var raised = 0
        var skipped = 0

        for (case in corpus["cases"]) {
            val name = case["name"].asText()
            val expectsThrow = case.has("throws") && case["throws"].asBoolean()

            val value = try {
                decode(case["value"])
            } catch (e: UnsupportedInKotlin) {
                // Only ever a "must raise" case: the type system has already
                // made it unrepresentable, which is a stronger guarantee than
                // raising at run time.
                if (!expectsThrow) {
                    failures += "$name: corpus carries an unsupported value for a case " +
                        "that is expected to serialise"
                }
                skipped++
                continue
            }

            if (expectsThrow) {
                try {
                    Canonical.canonicalise(value)
                    failures += "$name: expected canonicalisation to fail, it succeeded"
                } catch (_: Canonical.CanonicalisationError) {
                    raised++
                } catch (_: IllegalArgumentException) {
                    raised++
                }
            } else {
                val expectedCanonical = case["canonical"].asText()
                val expectedHash = case["sha256"].asText()

                val actualCanonical = try {
                    Canonical.canonicalise(value)
                } catch (e: Exception) {
                    failures += "$name: threw ${e.message}, expected $expectedCanonical"
                    continue
                }

                if (actualCanonical != expectedCanonical) {
                    failures += "$name: canonical form\n     expected ${show(expectedCanonical)}\n" +
                        "     actual   ${show(actualCanonical)}"
                    continue
                }

                val actualHash = Canonical.hash(value)
                if (actualHash != expectedHash) {
                    failures += "$name: sha256 expected $expectedHash, actual $actualHash"
                    continue
                }
                checked++
            }
        }

        println("conformance: $checked serialised, $raised raised, $skipped unrepresentable in Kotlin")

        // Divergences first. The counts below guard against the suite silently
        // checking nothing, but when something actually disagrees that is what
        // the reader needs — an earlier "too few cases compared" assertion hides
        // 25 real diffs behind an arithmetic complaint.
        if (failures.isNotEmpty()) {
            val report = failures.joinToString(separator = "\n\n")
            fail("${failures.size} case(s) diverge from the reference:\n\n$report")
        }

        // The unrepresentable set is function, symbol and bigint. If it grows,
        // something is being skipped that should not be.
        assertEquals(3, skipped, "unexpected number of cases skipped as unrepresentable")
        assertTrue(checked > 50, "too few cases actually compared: $checked")
    }

    /** Show escapes and non-ASCII so a diff in the output is readable. */
    private fun show(s: String): String = buildString {
        append('«')
        for (c in s) {
            when {
                c == '\n' -> append("\\n")
                c == '\t' -> append("\\t")
                c.code < 0x20 || c.code > 0x7e -> append("\\u%04x".format(c.code))
                else -> append(c)
            }
        }
        append('»')
    }
}
