plugins {
    kotlin("jvm")
}

/**
 * The engine has no runtime dependencies. Not an accident, and not thrift: a
 * canonicaliser built on a JSON library would inherit that library's opinions
 * about number formatting, key ordering and surrogate handling — the three
 * things ADR-003 exists to pin down.
 *
 * Splitting :engine from :service makes that a fact the build enforces rather
 * than a comment somebody can quietly ignore. Jackson is available to the
 * tests, which read the corpora, and to :service, which parses HTTP request
 * bodies. Neither can reach the hashing path from here.
 */
dependencies {
    testImplementation(kotlin("test"))
    testImplementation("com.fasterxml.jackson.core:jackson-databind:2.17.2")
}

kotlin { jvmToolchain(17) }

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "failed", "skipped")
        showStandardStreams = true
    }
}
