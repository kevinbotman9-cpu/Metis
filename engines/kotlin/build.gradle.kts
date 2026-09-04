// Root build. Everything real lives in :engine and :service.
plugins {
    kotlin("jvm") version "2.0.21" apply false
}

subprojects {
    repositories { mavenCentral() }
}
