#!/usr/bin/env node
/**
 * METIS conformance gate.
 *
 * This is the mechanism that stops Claude Code from drifting away from UI,
 * usability and configurability. Nothing in CLAUDE.md or the UX contract has
 * force unless a check here fails when it is violated.
 *
 * Wire it into CI and into `npm run conformance`. Run it at the start and end of
 * every agent session.
 *
 * PATHS ARE PLACEHOLDERS. Adjust the CONFIG block to match the repo, then delete
 * this comment.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";

const CONFIG = {
  root: process.cwd(),
  consoleAppDir: "apps/console/app",
  uiKitDir: "packages/ui-kit",
  apiClientDir: "packages/api-client",
  layoutRegistry: "packages/ui-metadata/src/layouts/index.ts",
  layoutSources: "apps/console/lib/layouts/sources.ts",
  capabilityMap: "docs/CAPABILITIES.md",
  e2eDir: "apps/console/tests/e2e",
};

const failures = [];
const warnings = [];
const fail = (check, msg) => failures.push({ check, msg });
const warn = (check, msg) => warnings.push({ check, msg });

// ---------------------------------------------------------------- utilities

/**
 * Every path this file compares against a pattern is POSIX-style.
 *
 * `path.join` and `path.relative` produce backslashes on Windows, and every
 * regex and `startsWith` below is written with forward slashes — so until this
 * existed, `routeFiles()` matched zero routes on Windows and the mock-banner
 * and layout-manifest checks passed on nothing. Node's fs accepts forward
 * slashes on Windows, so normalising at the source costs nothing.
 */
const posix = (p) => p.split(sep).join("/");

function walk(dir, exts = [".ts", ".tsx", ".js", ".jsx", ".css"]) {
  const abs = join(CONFIG.root, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  const rec = (d) => {
    for (const e of readdirSync(d)) {
      if (e === "node_modules" || e === ".next" || e === "dist") continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) rec(p);
      else if (exts.includes(extname(p))) out.push(posix(p));
    }
  };
  rec(abs);
  return out;
}

const read = (p) => readFileSync(p, "utf8");
const rel = (p) => posix(relative(CONFIG.root, p));

/**
 * The layout registry and the page recogniser, imported rather than read as
 * text: `npm run conformance` and `check-conformance.mjs` both run this file
 * under tsx. If the registry cannot load, every page is read as undeclared —
 * the checks below then fail loudly rather than pass over nothing.
 */
let LAYOUTS = {};
let declaredScreen = () => null;
let layoutRegistryError = null;
try {
  ({ LAYOUTS, declaredScreen } = await import(pathToFileURL(join(CONFIG.root, CONFIG.layoutRegistry)).href));
} catch (err) {
  layoutRegistryError = err;
}

function routeFiles() {
  return walk(CONFIG.consoleAppDir, [".tsx"]).filter((p) =>
    /\/(page|route)\.tsx?$/.test(p)
  );
}

// ------------------------------------------------------ CHECK 1: raw fetch

function checkGeneratedClientOnly() {
  const offenders = [];
  for (const dir of ["apps", "packages"]) {
    for (const f of walk(dir)) {
      if (f.includes(CONFIG.apiClientDir)) continue;
      const src = read(f);
      if (/\b(fetch\s*\(|axios\.|new XMLHttpRequest)/.test(src)) {
        offenders.push(rel(f));
      }
    }
  }
  if (offenders.length) {
    fail(
      "generated-client-only",
      `Hand-rolled HTTP calls outside the generated client:\n    ${offenders.join("\n    ")}`
    );
  }
}

// -------------------------------------------------- CHECK 2: design tokens

function checkTokensOnly() {
  const rawColour = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
  const rawSpacing = /:\s*\d+(\.\d+)?px/;
  const offenders = [];
  for (const dir of [CONFIG.consoleAppDir, CONFIG.uiKitDir]) {
    for (const f of walk(dir)) {
      if (/tokens?\.(ts|css|json)$/.test(f)) continue;
      const src = read(f);
      if (rawColour.test(src) || rawSpacing.test(src)) offenders.push(rel(f));
    }
  }
  if (offenders.length) {
    fail(
      "tokens-only",
      `Raw colour or spacing values outside token definitions:\n    ${offenders.join("\n    ")}`
    );
  }
}

// ------------------------------------------- CHECK 3: form descriptor drift
//
// Removed 2026-09-08. `packages/ui-metadata/tests/descriptors.test.ts` does
// this properly and supersedes it: it diffs every registered descriptor against
// its OpenAPI schema in both directions, requires a stated reason for each
// property the form deliberately does not manage, and checks that conditions
// and suggestions point at fields that exist. It runs in `npm test` and in CI
// as the "Form descriptors match the spec" step.
//
// The version that lived here could not have done any of that. It parsed
// `openapi/metis.json`, a path this repo has never had — the spec is YAML at
// docs/metis-api.openapi.yaml — so it failed on the missing file and never
// reached a descriptor. Two checks for one rule is one check going stale, and
// this was the stale one.

// ------------------------------------------------- CHECK 4: mock-mode honesty

function checkMockBanner() {
  // A declared screen's page names no data layer at all — the host resolves the
  // manifest's sources — so it is judged by that host, the only place its data
  // can come from. Read alone, every converted page would look unwired.
  const hostFile = join(CONFIG.root, CONFIG.layoutSources);
  const host = existsSync(hostFile) ? read(hostFile) : "";
  for (const f of routeFiles()) {
    const src = declaredScreen(read(f)) ? host : read(f);
    const usesClient = new RegExp(CONFIG.apiClientDir.split("/").pop()).test(src);
    const hasBanner = /MockModeBanner/.test(src);
    const looksMocked = /\b(mock|MOCK|fixture|sampleData|stubData|placeholderData)\b/.test(src);

    if ((looksMocked || !usesClient) && !hasBanner) {
      fail("mock-banner", `${rel(f)} does not read from the generated client and shows no MockModeBanner. A screen that lies about being wired is worse than no screen.`);
    }
    if (hasBanner && usesClient && !looksMocked) {
      fail("mock-banner", `${rel(f)} renders MockModeBanner but appears fully wired. Remove the vestigial banner.`);
    }
  }
}

// -------------------------------------------- CHECK 5: routes have manifests

/**
 * Routes that render outside the app shell, and so outside the layout system.
 *
 * A manifest is composed against a session, a persona and a nav. `/login`
 * renders before any of the three exists, so a manifest for it would resolve
 * nothing. See UX_CONTRACT.md §2.
 */
const SHELL_EXEMPT = new Set(["/login"]);

/** `[id]`, `[...path]`, `[[...path]]` — any dynamic segment. */
const isDynamicRoute = (routePath) => /\[[^\]]+\]/.test(routePath);

/**
 * A route passes only if its page renders through a manifest the registry
 * holds, declared for that route. ADR-015 §5.1.
 *
 * Until 2026-09-11 this passed any route whose path appeared anywhere in a file
 * under a directory that did not exist — so one file listing twenty-one paths
 * would have cleared every route without converting a screen. Now the page
 * itself is read: it must be `<Screen manifest="…" />` and nothing else.
 *
 * The `[id]` exemption stays until ADR-015's third step narrows it to a
 * list–detail's declared `detailRoute`, together with enough conversions that
 * the count does not rise (§5.3). There is no pending list for routes: the
 * baseline is the ledger, and it falls only as pages are converted (§5.4).
 */
function checkLayoutManifests() {
  if (layoutRegistryError) {
    fail("layout-manifests", `Could not load the layout registry at ${CONFIG.layoutRegistry}: ${layoutRegistryError.message}`);
  }
  for (const f of routeFiles()) {
    // The root route is `app/page.tsx`: nothing precedes the filename once the
    // app dir is stripped, so the separator is optional and the result is "/".
    const routePath =
      "/" +
      rel(f)
        .replace(`${CONFIG.consoleAppDir}/`, "")
        .replace(/(^|\/)(page|route)\.tsx?$/, "");

    // A detail route renders inside its parent's list–detail manifest; it is
    // one screen with two panes, not two screens. UX_CONTRACT.md §2.
    if (isDynamicRoute(routePath) || SHELL_EXEMPT.has(routePath)) continue;

    const id = declaredScreen(read(f));
    if (!id) {
      fail("layout-manifests", `Route "${routePath}" does not render through a layout manifest: its page must be \`<Screen manifest="…" />\` and nothing else. Screens are declared, not coded. See UX_CONTRACT.md §2.`);
      continue;
    }
    const manifest = LAYOUTS[id];
    if (!manifest) {
      fail("layout-manifests", `Route "${routePath}" renders manifest "${id}", which the layout registry does not hold.`);
    } else if (manifest.route !== routePath) {
      fail("layout-manifests", `Route "${routePath}" renders manifest "${id}", which is declared for "${manifest.route}".`);
    }
  }
}

// ------------------------------------------- CHECK 6: screen-only e2e exists

function checkScreenOnlyTests() {
  const tests = walk(CONFIG.e2eDir, [".ts", ".spec.ts"]);
  const tagged = tests.filter((f) => /@screen-only/.test(read(f)));
  if (!tagged.length) {
    fail("screen-only-e2e", "No @screen-only e2e tests found. This is the check that proves a capability is operable by a human. Without it, everything else here is theatre.");
    return;
  }
  // Setup purity: a @screen-only test must not call the API to get into position.
  for (const f of tagged) {
    const src = read(f);
    if (/\b(request\.(post|put|patch)|apiClient\.|seedDatabase|createViaApi)\b/.test(src)) {
      fail("screen-only-e2e", `${rel(f)} is tagged @screen-only but performs API setup. If the test needs an API call to get into position, the journey has a hole in the UI.`);
    }
  }
}

// ------------------------------------ CHECK 7: no forbidden status vocabulary

function checkStatusHonesty() {
  const docs = walk("docs", [".md"]).concat(
    existsSync(join(CONFIG.root, "PHASES_SUMMARY.md")) ? [join(CONFIG.root, "PHASES_SUMMARY.md")] : []
  );
  for (const f of docs) {
    if (rel(f).startsWith("docs/evaluation/")) continue;
    const src = read(f);
    if (/✅/.test(src)) {
      warn("status-honesty", `${rel(f)} contains ✅ completion marks. Status is emitted by this script, not authored. Use BUILT / ENGINE-ONLY / SCAFFOLD / ABSENT with evidence.`);
    }
  }
}

// ------------------------------- CHECK 8: the capability map is not going stale
//
// This used to check that a capability ledger existed and was not old. The
// existence half is now `tests/docs-status.test.ts`, which asserts every
// allow-listed status document is present and that no second document claims
// anything is built — a stronger check than a file test, and it runs in the
// suite rather than only here.
//
// What that test does not cover is age, so that is all this does. It reads the
// map's own "Last verified" line rather than the file's mtime, because mtime
// says when somebody edited the file and the map's claim is about when somebody
// last ran the suites.

function checkCapabilityMapFreshness() {
  const p = join(CONFIG.root, CONFIG.capabilityMap);
  if (!existsSync(p)) return; // docs-status.test.ts owns existence.

  const m = read(p).match(/\*\*Last verified:\*\*\s*(\d{4}-\d{2}-\d{2})/);
  if (!m) {
    fail(
      "capability-map",
      `${CONFIG.capabilityMap} has no "**Last verified:** YYYY-MM-DD" line. A status claim with no date cannot be known to be stale, which is how the last three drifted.`
    );
    return;
  }

  const ageDays = (Date.now() - Date.parse(m[1])) / 86400000;
  if (ageDays > 14) {
    warn(
      "capability-map",
      `Capability map was last verified ${Math.round(ageDays)} days ago (${m[1]}). Re-run the suites before trusting any status claim in it.`
    );
  }
}

// ----------------------------------------------------------------- run

const CHECKS = [
  ["generated-client-only", checkGeneratedClientOnly],
  ["tokens-only", checkTokensOnly],
  ["mock-banner", checkMockBanner],
  ["layout-manifests", checkLayoutManifests],
  ["screen-only-e2e", checkScreenOnlyTests],
  ["status-honesty", checkStatusHonesty],
  ["capability-map", checkCapabilityMapFreshness],
];

console.log("METIS conformance\n" + "=".repeat(60));
for (const [name, fn] of CHECKS) {
  try {
    fn();
    console.log(`  ran  ${name}`);
  } catch (err) {
    fail(name, `check threw: ${err.message}`);
  }
}

console.log("\n" + "=".repeat(60));
if (warnings.length) {
  console.log(`\n${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  [${w.check}] ${w.msg}`);
}
if (failures.length) {
  console.log(`\n${failures.length} failure(s):\n`);
  for (const f of failures) console.log(`  [${f.check}] ${f.msg}\n`);
  console.log("Conformance FAILED.");
  process.exit(1);
}
console.log("\nConformance passed.");

/*
 * NOT YET IMPLEMENTED — add these as the repo supports them:
 *
 *  - axe-core run per route, zero critical/serious violations
 *  - keyboard-path assertion per @screen-only test
 *  - five-state coverage (empty/loading/error/populated/dense) per route
 *  - explainable-primitive wrapper check on numeric displays
 *  - nav generated from passing-route set, no hand-maintained array
 *  - p95 latency gate on hot-path changes
 *  - tenant-isolation test per new endpoint
 *
 * Each is a line in UX_CONTRACT.md that currently has no teeth. A rule with no
 * check is a suggestion, and Claude Code does not follow suggestions across a
 * four-hour session.
 */
