plugins {
    kotlin("jvm")
    application
}

dependencies {
    implementation(project(":engine"))
    // Parsing request bodies is a service concern, not an engine one.
    implementation("com.fasterxml.jackson.core:jackson-databind:2.17.2")

    testImplementation(kotlin("test"))
}

kotlin { jvmToolchain(17) }

application {
    mainClass.set("com.metis.service.MainKt")
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "failed", "skipped")
        showStandardStreams = true
    }
}

/**
 * The conformance corpora are inputs to these tests, and Gradle cannot know
 * that on its own: the tests read them from `docs/conformance/` by path at
 * runtime, so nothing in the task graph connects the two.
 *
 * Without this, regenerating a corpus and running `./gradlew test` reports
 * UP-TO-DATE and passes without reading a byte of the new corpus — which is
 * exactly the moment the check matters most. Observed on 2026-09-05, during
 * the taxonomy rename that changed every chain hash in all three corpora.
 */
tasks.test {
    inputs.files(fileTree(rootProject.projectDir.resolve("../../docs/conformance")) {
        include("*.json")
    }).withPathSensitivity(PathSensitivity.RELATIVE)
        .withPropertyName("conformanceCorpora")
}
