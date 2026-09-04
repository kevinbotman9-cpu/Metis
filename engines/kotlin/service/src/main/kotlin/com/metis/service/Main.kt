package com.metis.service

import java.io.File

/**
 * Run the JVM decision service.
 *
 *   ./gradlew :service:run --args="--bundle ../../docs/conformance/service-bundle.json --port 8081"
 *
 * The bundle is a JSON file holding the artifacts and the catalogue snapshot,
 * in the shapes the TypeScript engine executes. There is no artifact registry
 * to fetch from yet — that is registered in docs/gaps.md — so the service reads
 * a file and says so rather than pretending to a lifecycle it does not have.
 */
fun main(args: Array<String>) {
    val options = parse(args)
    val bundle = File(options.bundle)

    val store = try {
        Store.load(bundle)
    } catch (e: Exception) {
        System.err.println("Could not load bundle ${bundle.absolutePath}: ${e.message}")
        kotlin.system.exitProcess(2)
    }

    val service = DecisionService(store, options.port)
    service.start()

    println(
        """
        METIS decision service (Kotlin engine)
          listening   http://localhost:${service.boundPort}
          bundle      ${bundle.absolutePath}
          artifacts   ${store.artifacts.keys.sorted().joinToString(", ")}
          catalogue   ${store.catalogueHash.take(16)}...

        State is in memory. A restart loses every trace, so replay only works
        for decisions this process made.
        """.trimIndent()
    )

    Runtime.getRuntime().addShutdownHook(Thread { service.stop() })
}

private data class Options(val bundle: String, val port: Int)

private fun parse(args: Array<String>): Options {
    var bundle: String? = null
    var port = 8081

    var i = 0
    while (i < args.size) {
        when (args[i]) {
            "--bundle" -> bundle = args.getOrNull(++i)
            "--port" -> port = args.getOrNull(++i)?.toIntOrNull()
                ?: error("--port needs a number")
            else -> error("Unknown argument: ${args[i]}")
        }
        i++
    }

    return Options(
        bundle = bundle ?: error("--bundle is required: the service has nothing to decide with"),
        port = port,
    )
}
