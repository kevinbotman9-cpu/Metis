package com.metis.canonical

import java.security.MessageDigest

/**
 * Canonical serialisation and hashing, per ADR-003.
 *
 * A second implementation of the contract in
 * `packages/runtime/src/deterministic/canonical.ts`, in a different language,
 * held to byte-identical output by the shared corpus in
 * `docs/conformance/canonical-corpus.json`.
 *
 * The point is not that the JVM is faster. It is that the determinism claim is
 * a property of a specification rather than of one file of TypeScript, and the
 * only way to know that is to write it twice and check.
 *
 * No JSON library, deliberately. A canonicaliser built on Jackson or kotlinx
 * would inherit that library's opinions about number formatting, key ordering
 * and surrogate handling — the exact three things ADR-003 exists to pin down.
 */
object Canonical {

    /**
     * The value model.
     *
     * JSON's types plus an explicit `Absent`, because the rules distinguish
     * "member present with value null" from "member absent", and a language
     * without `undefined` needs somewhere to put that difference.
     */
    sealed interface Value {
        data object Null : Value
        data object Absent : Value
        data class Bool(val value: Boolean) : Value
        data class Num(val value: Double) : Value
        data class Str(val value: String) : Value
        data class Arr(val items: List<Value>) : Value
        /** Insertion-ordered; canonicalise sorts. */
        data class Obj(val members: List<Pair<String, Value>>) : Value
    }

    class CanonicalisationError(message: String) : IllegalArgumentException(message)

    fun canonicalise(value: Value, path: String = "$"): String {
        val out = StringBuilder()
        write(value, path, out)
        return out.toString()
    }

    /** SHA-256 of the canonical form, lowercase hex. */
    fun hash(value: Value): String {
        val bytes = canonicalise(value).toByteArray(Charsets.UTF_8)
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes)
        // Not String.format("%02X"): ADR-003 §5 says lowercase.
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun write(value: Value, path: String, out: StringBuilder) {
        when (value) {
            is Value.Absent ->
                throw CanonicalisationError("Cannot canonicalise an absent value at $path")

            is Value.Null -> out.append("null")

            is Value.Bool -> out.append(if (value.value) "true" else "false")

            is Value.Num -> {
                if (value.value.isNaN() || value.value.isInfinite()) {
                    throw CanonicalisationError(
                        "Cannot canonicalise non-finite number at $path: ${value.value}"
                    )
                }
                out.append(NumberFormat.toEcmaScriptString(value.value))
            }

            is Value.Str -> quote(value.value, out)

            is Value.Arr -> {
                out.append('[')
                value.items.forEachIndexed { i, item ->
                    if (i > 0) out.append(',')
                    write(item, "$path[$i]", out)
                }
                out.append(']')
            }

            is Value.Obj -> {
                // Absent members are dropped, then keys are sorted by UTF-16
                // code unit. Kotlin's natural String ordering is exactly that,
                // because JVM strings are UTF-16 — the same order JavaScript's
                // default sort produces. A UTF-8 language would have to sort
                // explicitly by code unit to agree above the BMP.
                val present = value.members
                    .filter { it.second !is Value.Absent }
                    .sortedBy { it.first }

                out.append('{')
                present.forEachIndexed { i, (key, member) ->
                    if (i > 0) out.append(',')
                    quote(key, out)
                    out.append(':')
                    write(member, "$path.$key", out)
                }
                out.append('}')
            }
        }
    }

    /**
     * ECMAScript `QuoteJSONString` (ECMA-262 §25.5.2.2), per ADR-003 §4.
     *
     * Walks UTF-16 code units rather than code points, so a lone surrogate is
     * escaped rather than replaced with U+FFFD — which is what
     * `String.toByteArray` would silently do to it.
     */
    private fun quote(s: String, out: StringBuilder) {
        out.append('"')
        var i = 0
        while (i < s.length) {
            val c = s[i]
            when {
                c == '"' -> out.append("\\\"")
                c == '\\' -> out.append("\\\\")
                c == '\b' -> out.append("\\b")
                c == '' -> out.append("\\f")
                c == '\n' -> out.append("\\n")
                c == '\r' -> out.append("\\r")
                c == '\t' -> out.append("\\t")
                c < ' ' -> out.append(escape(c))

                // A high surrogate is only well-formed if a low surrogate
                // follows. Emit the pair untouched; escape it if it is alone.
                c.isHighSurrogate() -> {
                    if (i + 1 < s.length && s[i + 1].isLowSurrogate()) {
                        out.append(c).append(s[i + 1])
                        i++
                    } else {
                        out.append(escape(c))
                    }
                }

                // A low surrogate reached on its own is unpaired by definition:
                // a well-formed pair was consumed by the branch above.
                c.isLowSurrogate() -> out.append(escape(c))

                else -> out.append(c)
            }
            i++
        }
        out.append('"')
    }

    /** `\uXXXX` with four lowercase hex digits. */
    private fun escape(c: Char): String = "\\u" + "%04x".format(c.code)
}
