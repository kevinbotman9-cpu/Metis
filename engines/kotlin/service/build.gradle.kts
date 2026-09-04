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
