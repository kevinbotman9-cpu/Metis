package com.metis

import java.io.File

/**
 * Locate a conformance corpus without hard-coding how deep this module sits.
 *
 * The tests originally used `../../docs/...`, which broke the moment :engine
 * moved a level down for the multi-module split. Walking up to the repository
 * root means the next restructure does not silently point the suite at a file
 * that is not there — and a missing corpus must fail loudly, because a test
 * that quietly compares nothing is worse than one that fails.
 */
object Corpus {

    fun file(name: String): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "docs/conformance/$name")
            if (candidate.exists()) return candidate
            dir = dir.parentFile
        }
        error(
            "Corpus '$name' not found in any ancestor of ${File("").absolutePath}. " +
                "Run `npm run corpus` at the repository root."
        )
    }
}
