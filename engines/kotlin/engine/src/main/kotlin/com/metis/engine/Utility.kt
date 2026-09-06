package com.metis.engine

/**
 * Ranking functions, mirroring packages/core/src/utility.ts.
 *
 * Same AST, same closed operation set, same two built-ins. The decision corpus
 * is what proves the two agree; this file only has to be a faithful port.
 *
 * One deliberate difference from the TypeScript, and it is the same one the
 * arbitrate node already carried: `pow` is StrictMath, not Math. Neither
 * JavaScript's Math.pow nor Java's is required to be correctly rounded, so they
 * may differ by an ulp — which after rounding to 8dp can still change a hash.
 * StrictMath is fdlibm, and so is V8's, so they agree. ADR-003 §4a pins this.
 */
sealed interface UtilityExpr {
    data class Const(val value: Double) : UtilityExpr
    data class Term(val name: String) : UtilityExpr
    data class Weight(val name: String) : UtilityExpr
    data class Pow(val base: UtilityExpr, val exponent: UtilityExpr) : UtilityExpr
    data class Mul(val operands: List<UtilityExpr>) : UtilityExpr
    data class Add(val operands: List<UtilityExpr>) : UtilityExpr
    data class Sub(val left: UtilityExpr, val right: UtilityExpr) : UtilityExpr
    data class Max(val operands: List<UtilityExpr>) : UtilityExpr
    data class Min(val operands: List<UtilityExpr>) : UtilityExpr
}

data class UtilityFunction(
    val id: String,
    val version: String,
    val expression: String,
    val terms: List<String>,
    val weights: List<String>,
    val ast: UtilityExpr,
)

class UtilityTermMissing(val term: String, val kind: String) :
    IllegalArgumentException("Utility function referenced $kind \"$term\", which was not supplied.")

object Utility {
    val KNOWN_TERMS = listOf("propensity", "value", "boost", "context", "cost")

    val MULTIPLICATIVE = UtilityFunction(
        id = "multiplicative",
        version = "1.0.0",
        expression = "P^wP × V^wV × B^wB × C^wC",
        terms = listOf("propensity", "value", "boost", "context"),
        weights = listOf("propensity", "value", "boost", "context"),
        ast = UtilityExpr.Mul(
            listOf(
                UtilityExpr.Pow(UtilityExpr.Term("propensity"), UtilityExpr.Weight("propensity")),
                UtilityExpr.Pow(UtilityExpr.Term("value"), UtilityExpr.Weight("value")),
                UtilityExpr.Pow(UtilityExpr.Term("boost"), UtilityExpr.Weight("boost")),
                UtilityExpr.Pow(UtilityExpr.Term("context"), UtilityExpr.Weight("context")),
            )
        ),
    )

    val EXPECTED_VALUE = UtilityFunction(
        id = "expected-value",
        version = "1.0.0",
        expression = "(P × V − Cost) × B",
        terms = listOf("propensity", "value", "cost", "boost"),
        weights = emptyList(),
        ast = UtilityExpr.Mul(
            listOf(
                UtilityExpr.Sub(
                    UtilityExpr.Mul(listOf(UtilityExpr.Term("propensity"), UtilityExpr.Term("value"))),
                    UtilityExpr.Term("cost"),
                ),
                UtilityExpr.Term("boost"),
            )
        ),
    )

    val BUILT_IN = listOf(MULTIPLICATIVE, EXPECTED_VALUE)

    fun resolve(ref: UtilityRef): UtilityFunction? =
        BUILT_IN.firstOrNull { it.id == ref.id && it.version == ref.version }

    fun key(ref: UtilityRef): String = "${ref.id}@${ref.version}"

    fun evaluate(
        fn: UtilityFunction,
        terms: Map<String, Double>,
        weights: Map<String, Double>,
    ): Double {
        fun walk(e: UtilityExpr): Double = when (e) {
            is UtilityExpr.Const -> e.value
            is UtilityExpr.Term -> terms[e.name] ?: throw UtilityTermMissing(e.name, "term")
            is UtilityExpr.Weight -> weights[e.name] ?: throw UtilityTermMissing(e.name, "weight")
            is UtilityExpr.Pow -> StrictMath.pow(walk(e.base), walk(e.exponent))
            // fold(1.0) and fold(0.0) so an empty operand list is the identity,
            // matching the TypeScript's reduce with the same seeds.
            is UtilityExpr.Mul -> e.operands.fold(1.0) { a, o -> a * walk(o) }
            is UtilityExpr.Add -> e.operands.fold(0.0) { a, o -> a + walk(o) }
            is UtilityExpr.Sub -> walk(e.left) - walk(e.right)
            is UtilityExpr.Max -> e.operands.map { walk(it) }.reduce { a, b -> if (b > a) b else a }
            is UtilityExpr.Min -> e.operands.map { walk(it) }.reduce { a, b -> if (b < a) b else a }
        }
        return walk(fn.ast)
    }
}
