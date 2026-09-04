package com.metis.canonical

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode

/**
 * ECMAScript `Number::toString` (ECMA-262 §6.1.6.1.20), radix 10.
 *
 * This exists because `Double.toString` is not it, and the difference is not
 * cosmetic — it changes every hash. Java renders `1.0`, `1.0E21`, `1.0E-7`
 * where ECMAScript renders `1`, `1e+21`, `1e-7`. On JDK 17 `Double.toString`
 * is also not shortest-round-trip, so the digits themselves can differ.
 *
 * See docs/adr/ADR-003-canonical-serialisation.md §3. The rules are normative;
 * this is an implementation of them, and the corpus is what decides whether it
 * is a correct one.
 */
object NumberFormat {

    fun toEcmaScriptString(value: Double): String {
        require(!value.isNaN() && !value.isInfinite()) {
            "Non-finite numbers have no canonical form: $value"
        }
        // -0.0 == 0.0 is true, so this catches both zeroes. ADR-003 §3 collapses
        // negative zero deliberately: it is a distinct IEEE-754 value that
        // compares equal, and letting it through would hash two structurally
        // equal decisions differently.
        if (value == 0.0) return "0"
        if (value < 0) return "-" + toEcmaScriptString(-value)

        val (digits, n) = shortestDigits(value)
        val k = digits.length

        return when {
            // k <= n <= 21: the digits, then n-k zeroes.
            n in k..21 -> digits + "0".repeat(n - k)

            // 0 < n <= 21: a decimal point after n digits.
            n in 1..21 -> digits.substring(0, n) + "." + digits.substring(n)

            // -6 < n <= 0: "0." then -n zeroes then the digits.
            n in -5..0 -> "0." + "0".repeat(-n) + digits

            // Otherwise exponential, with the exponent being n-1.
            else -> {
                val exponent = n - 1
                val sign = if (exponent >= 0) "+" else "-"
                val mantissa = if (k == 1) digits else digits[0] + "." + digits.substring(1)
                "${mantissa}e$sign${Math.abs(exponent)}"
            }
        }
    }

    /**
     * The shortest decimal that round-trips, as (digits, n) where the value is
     * 0.digits x 10^n.
     *
     * ECMA-262 requires k to be "as small as possible", i.e. the fewest
     * significant digits that still parse back to the identical double. Trying
     * increasing precision and checking the round-trip is the portable way to
     * get that without importing a Ryu or Grisu implementation, and at 1-17
     * iterations of a cheap operation it is not on any hot path — the engine
     * hashes numbers, it does not format them in a loop.
     */
    private fun shortestDigits(value: Double): Pair<String, Int> {
        for (precision in 1..17) {
            val candidate = BigDecimal(value).round(MathContext(precision, RoundingMode.HALF_EVEN))
            if (candidate.toDouble() == value) {
                return normalise(candidate)
            }
        }
        // 17 significant digits always round-trips a double; reaching here would
        // mean BigDecimal(double) is lying about the value.
        return normalise(BigDecimal(value).round(MathContext(17, RoundingMode.HALF_EVEN)))
    }

    /** Strip trailing zeroes and express as (significant digits, exponent n). */
    private fun normalise(decimal: BigDecimal): Pair<String, Int> {
        val stripped = decimal.stripTrailingZeros()
        val unscaled = stripped.unscaledValue().toString()
        // BigDecimal value = unscaled x 10^-scale. We want 0.digits x 10^n, so
        // n is the count of digits before the decimal point.
        val n = unscaled.length - stripped.scale()
        return unscaled to n
    }
}
