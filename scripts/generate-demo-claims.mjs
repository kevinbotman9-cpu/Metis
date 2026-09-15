#!/usr/bin/env node
/**
 * docs/DEMO_CLAIMS.md — the sales team's boundary document, generated.
 *
 *   npm run demo:claims
 *
 * Demo week, 2026-09-16. Written from the tree, not from memory or from the
 * other documents: every line below is produced by reading a file, running a
 * check, or searching the source, and each says what it was produced from.
 *
 * - **Demonstrable today** — a capability row marked BUILT in
 *   docs/CAPABILITIES.md whose evidence cites a test file that exists, and,
 *   where it names a test, a test by that name inside it.
 * - **Built but unproven** — a BUILT or PARTIAL row that cites no check this
 *   script can find, plus facts about the tree that no check enforces.
 * - **Not built** — ABSENT, PLANNED and OUT OF SCOPE rows, plus the facts the
 *   product owner required stated, each verified here.
 * - **Where a document and the tree disagree** — a row citing a check that does
 *   not exist, and prose claims tested against the source.
 *
 * Not a status table: `tests/docs-status.test.ts` refuses a table row outside
 * CAPABILITIES.md whose last cell asserts completion, and this document must
 * not become a second capability map. It is lists that cite their sources.
 */
import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const exists = (rel) => existsSync(path.join(root, rel));

// ---------------------------------------------------------------------------
// Every test file in the tree, so a citation can be resolved by path or by name
// ---------------------------------------------------------------------------

const SKIP = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'test-results', 'playwright-report', 'docs']);
const TEST_FILE = /(\.test\.tsx?|\.spec\.ts|Test\.kt)$/;
const testFiles = [];
(function walk(dir, rel) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), r);
    else if (TEST_FILE.test(entry.name)) testFiles.push(r);
  }
})(root, '');

/** A cited file, by path suffix: `e2e/ledger.spec.ts` matches `apps/console/tests/e2e/ledger.spec.ts`. */
function resolveTestFile(cited) {
  const clean = cited.replace(/:\d+(-\d+)?$/, '');
  const matches = testFiles.filter((f) => f === clean || f.endsWith(`/${clean}`));
  return matches.length === 1 ? matches[0] : matches.length > 1 ? matches[0] : null;
}

// ---------------------------------------------------------------------------
// Capability rows
// ---------------------------------------------------------------------------

const capabilities = read('docs/CAPABILITIES.md');
const rows = [];
let section = '';
for (const [i, line] of capabilities.split('\n').entries()) {
  if (/^#{2,3} /.test(line)) section = line.replace(/^#+ /, '').trim();
  if (!line.startsWith('|') || !line.trim().endsWith('|')) continue;
  const cells = line.trim().slice(1, -1).split('|').map((c) => c.trim());
  if (cells.length < 5 || cells[1] === 'Status' || /^:?-+:?$/.test(cells[0])) continue;
  rows.push({
    line: i + 1,
    section,
    capability: cells[0].replace(/\*\*/g, ''),
    status: cells[1].replace(/\*\*/g, ''),
    screen: cells[2].replace(/\*\*/g, ''),
    evidence: cells.slice(4).join(' | '),
  });
}

/** Test files a row cites, and any test names it pairs with them (`file` › `name`). */
function citationsOf(evidence) {
  const cited = [];
  const named = [...evidence.matchAll(/`([^`]+?(?:\.test\.tsx?|\.spec\.ts|Test\.kt)(?::\d+)?)`\s*›\s*`([^`]+)`/g)];
  for (const m of named) cited.push({ file: m[1], name: m[2] });
  for (const m of evidence.matchAll(/`?([\w./{}*-]+?(?:\.test\.tsx?|\.spec\.ts|Test\.kt)(?::\d+)?)`?/g)) {
    if (m[1].includes('*') || m[1].includes('{')) continue;
    if (!cited.some((c) => c.file === m[1])) cited.push({ file: m[1], name: null });
  }
  return cited;
}

const demonstrable = [];
const unproven = [];
const notBuilt = [];
const mismatches = [];

for (const row of rows) {
  const status = row.status.toUpperCase();
  const where = `CAPABILITIES.md:${row.line}`;
  if (status.startsWith('ABSENT') || status.startsWith('OUT OF SCOPE') || status.startsWith('PLANNED')) {
    const sec = row.section.startsWith('§') ? row.section : `§${row.section}`;
    notBuilt.push(`**${row.capability}** — ${row.status}. (${where}, ${sec})`);
    continue;
  }
  if (!status.startsWith('BUILT') && !status.startsWith('PARTIAL') && !status.startsWith('ENGINE-ONLY') && !status.startsWith('SCAFFOLD')) {
    continue;
  }

  const resolved = [];
  for (const c of citationsOf(row.evidence)) {
    const file = resolveTestFile(c.file);
    if (!file) {
      mismatches.push(`${where} — **${row.capability}** cites \`${c.file}\`, and no test file by that name exists.`);
      continue;
    }
    if (c.name) {
      if (!read(file).includes(c.name)) {
        mismatches.push(`${where} — **${row.capability}** cites \`${file}\` › \`${c.name}\`, and that file has no test by that name.`);
        continue;
      }
    }
    resolved.push(c.name ? `\`${file}\` › \`${c.name}\`` : `\`${file}\``);
  }

  const screen = row.screen && row.screen !== 'NO' ? ` On screen: ${row.screen.replace(/^YES — /, '')}.` : '';
  if (status.startsWith('BUILT') && resolved.length > 0) {
    demonstrable.push(`**${row.capability}**.${screen} Check: ${[...new Set(resolved)].join('; ')}. (${where})`);
  } else {
    const why =
      resolved.length === 0
        ? 'cites no test file this script can resolve'
        : `checks exist (${[...new Set(resolved)].join('; ')}), and the row itself says the capability is incomplete`;
    unproven.push(`**${row.capability}** — ${row.status}; ${why}.${screen} (${where})`);
  }
}

// ---------------------------------------------------------------------------
// Facts the product owner required, each verified against the tree
// ---------------------------------------------------------------------------

const facts = { unproven: [], notBuilt: [], mismatches: [] };

// Latency: S1, from its own header.
const s1 = JSON.parse(read('bench/results/S1.json'));
if (s1.header) {
  const lat = s1.variants.map((v) => `${v.name} p50 ${v.result.latency.p50.toFixed(2)} ms, p95 ${v.result.latency.p95.toFixed(2)} ms, p99 ${v.result.latency.p99.toFixed(2)} ms, ${v.result.throughput.toFixed(0)}/s per core`).join('; ');
  facts.unproven.push(`**Engine latency (S1)** — ${lat}. Measured at commit \`${s1.context.codeVersion.slice(0, 12)}\` (\`bench/results/S1.json\`, \`${s1.header.reproduce}\`).`);
  facts.unproven.push(`S1 scope: ${s1.header.scope} Excluded from the timing: ${s1.header.excludedFromTiming.join('; ')}.`);
  facts.unproven.push(`S1 conditions: ${s1.header.machine}. ${s1.header.machineLoad} Tenant: ${s1.header.tenant} ${s1.header.sampleSize}. It generalises to: ${s1.header.generalisesTo}`);
  facts.notBuilt.push(`**M1 and M2 (ADR-016 §7)** — ${s1.header.notM1OrM2}`);
} else {
  facts.mismatches.push('`bench/results/S1.json` has no header stating its scope; it cannot be quoted.');
}

// Propensity and the model layer.
const scoring = read('packages/runtime/src/scoring/index.ts');
const onlySeeded = /let resolveScorer[^\n]*=\s*\(\)\s*=>\s*SEEDED_PROPENSITY/.test(scoring);
const seededHash = /seededUnitInterval\(customerId, offerKey, modelKey\)/.test(scoring);
const artifacts = read('apps/console/mocks/fixtures/artifacts.ts');
const demoScoreNodes = (artifacts.match(/type:\s*'score-(model|adaptive)'/g) ?? []).length;
const arbitration = read('apps/console/mocks/fixtures/catalogue.ts').match(/weights:\s*\{([^}]*)\}/)?.[1]?.trim();
const defaults = artifacts.match(/missingScoreDefault:\s*\{\s*propensity:\s*([\d.]+),\s*context:\s*([\d.]+)/);
const modelScreen = exists('apps/console/app/models/page.tsx');
const modelRegistry = exists('packages/registry/src/models.ts');
const featureStore = testFiles.some((f) => /feature-store/.test(f)) || exists('packages/feature-store');

facts.notBuilt.push(
  `**No model runs anywhere.** The only propensity scorer the runtime resolves is the seeded one (${onlySeeded ? 'verified' : 'NOT verified — check'}: \`packages/runtime/src/scoring/index.ts\`, \`resolveScorer\` returns \`SEEDED_PROPENSITY\`). No scorer is wired to anything.`
);
facts.notBuilt.push(
  `**The demo tenant's flows have no score node** (${demoScoreNodes} score nodes in \`apps/console/mocks/fixtures/artifacts.ts\`), so priority is value × boost: arbitration weights {${arbitration}}, with the approved missing-score default propensity ${defaults?.[1] ?? '?'} and context ${defaults?.[2] ?? '?'}.`
);
facts.notBuilt.push(
  `**Where a flow does score** (the conformance corpora and the benchmark only), propensity is a seeded hash of customer, offer and model${seededHash ? '' : ' (NOT verified — check)'}: \`0.05 + seededUnitInterval(customerId, offerKey, modelKey) × 0.9\`. It is not a learned score.`
);
facts.notBuilt.push(
  `**A Model entity, model registry and /models exist and serve no scorer.** (registry: ${modelRegistry ? '`packages/registry/src/models.ts`' : 'absent'}; screen: ${modelScreen ? '`apps/console/app/models/page.tsx`' : 'absent'}; #67.) Publishing a model version changes no decision.`
);
facts.notBuilt.push(`**There is no feature store.** (${featureStore ? 'NOT verified — a feature-store path exists, check' : 'no feature-store package or test in the tree'})`);

// Journey spines.
const spines = read('docs/JOURNEY_SPINES.md');
const spineHeads = [...spines.matchAll(/^## (Spine \d+ — [^\n]+)\n\n\*Persona: ([^.]+)\. \*\*([^*]+)\*\*/gm)].map((m) => `${m[1]} (${m[2]}): ${m[3].replace(/\s+/g, ' ').trim()}`);
const closed = spineHeads.filter((s) => /\bclosed\b/i.test(s) && !/retired/i.test(s));
facts.notBuilt.push(
  `**No journey spine is closed** (${closed.length} of ${spineHeads.length} read as closed in \`docs/JOURNEY_SPINES.md\`). ${spineHeads.join('; ')}. The demo path — a decision, its trace, and its replay — is a subset of Spine 3.`
);

// Conformance, run now.
const conf = spawnSync('npm', ['run', 'conformance'], { cwd: root, encoding: 'utf8', shell: true });
const confOut = `${conf.stdout}${conf.stderr}`;
const failures = confOut.match(/(\d+) failure\(s\)/)?.[1];
const warnings = confOut.match(/(\d+) warning\(s\)/)?.[1];
facts.notBuilt.push(
  failures
    ? `**UX conformance reports ${failures} failures and ${warnings ?? 0} warnings** (\`npm run conformance\`, run while generating this file).`
    : '**UX conformance could not be read** — `npm run conformance` produced no count.'
);

// Prose claims tested against the source.
const route = read('apps/console/app/api/[...path]/route.ts');
if (/There is no `\/models` route/.test(spines) && modelScreen) {
  facts.mismatches.push('`docs/JOURNEY_SPINES.md`, Spine 4, says "There is no `/models` route"; `apps/console/app/models/page.tsx` exists (#67).');
}
const manifests = readdirSync(path.join(root, 'packages/ui-metadata/src/layouts')).filter(
  (f) => f.endsWith('.ts') && !['index.ts', 'types.ts', 'page.ts'].includes(f)
);
if (/^\| Layout manifests — screens declared rather than coded \| ABSENT/m.test(capabilities) && manifests.length > 0) {
  facts.mismatches.push(
    `\`docs/CAPABILITIES.md\`, *Layout manifests — screens declared rather than coded*, says ABSENT; \`packages/ui-metadata/src/layouts/\` holds ${manifests.length} manifests (${manifests.join(', ')}) rendered through the list–detail pattern (ADR-015). Conformance still counts the routes not yet converted.`
  );
}
if (/The console does not read it/.test(capabilities) && /store\.ledger\.get\(/.test(route)) {
  facts.mismatches.push('`docs/CAPABILITIES.md`, *Durable decision ledger*, says "The console does not read it"; `apps/console/app/api/[...path]/route.ts` reads the ledger (`store.ledger.get`) to serve traces and replays of live decisions.');
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

const commit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
})();

const list = (items) => (items.length ? items.map((s) => `- ${s}`).join('\n') : '- (none found)');

const doc = `# Demo claims — what can be said, and what cannot

**Generated by \`npm run demo:claims\` from commit \`${commit}\`. Do not edit by hand: change the tree, or the capability map, and regenerate.**

This is the boundary for what is said about METIS in the demo on Fri 18 Sep. Every line cites what it was read from. An omission here is worse than an ugly truth, so the sections below are generated to include rows that read badly.

- **Demonstrable today** — marked BUILT, with a check this script found in the tree that fails when it breaks.
- **Built but unproven** — present, with no check this script could find behind it.
- **Not built** — absent, planned or out of scope, and the facts the product owner required stated.
- **Where a document and the tree disagree** — say the tree's version, not the document's.

## Where a document and the tree disagree

${list([...facts.mismatches, ...mismatches])}

## Not built

${list([...facts.notBuilt, ...notBuilt])}

## Built but unproven

${list([...facts.unproven, ...unproven])}

## Demonstrable today

${list(demonstrable)}
`;

writeFileSync(path.join(root, 'docs/DEMO_CLAIMS.md'), doc);
console.log(
  `docs/DEMO_CLAIMS.md: ${demonstrable.length} demonstrable, ${unproven.length + facts.unproven.length} unproven, ` +
    `${notBuilt.length + facts.notBuilt.length} not built, ${mismatches.length + facts.mismatches.length} disagreements; conformance ${failures ?? '?'}/${warnings ?? '?'}`
);
