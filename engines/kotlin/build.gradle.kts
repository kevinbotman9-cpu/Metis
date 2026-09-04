plugins {
    kotlin("jvm") version "2.0.21"
}

repositories { mavenCentral() }

dependencies {
    testImplementation(kotlin("test"))
    // The corpus is JSON; the test needs to read it. Nothing else is needed:
    // the implementation itself has no dependencies beyond the JDK, which is
    // deliberate — a canonicaliser that depends on a JSON library would be
    // inheriting that library's opinions about numbers and strings.
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
