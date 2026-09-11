/**
 * The checks `main` requires are the jobs the workflow runs.
 *
 * Which checks a pull request must pass is not in this repository. It is a
 * branch ruleset in GitHub's settings, edited by hand and readable only through
 * the API, so nothing held it to `.github/workflows/console.yml` — and it can
 * drift in both directions without anybody seeing:
 *
 * - **A job added to the workflow is not required.** It runs, it can go red,
 *   and the pull request merges anyway. A gate that cannot block is a report.
 * - **A job renamed or removed stays required.** GitHub waits for a check that
 *   will never report, and every pull request blocks until somebody with admin
 *   rights notices why.
 *
 * On 2026-09-10 the list was set by hand and matched only because it was read
 * back afterwards. This makes that reading-back permanent, with the same shape
 * as `tests/gates-parity.test.ts`: every job is required unless it is declared
 * in `NOT_REQUIRED` with a reason, and a declaration that has gone stale fails
 * as loudly as a missing requirement.
 *
 * The rules come from `GET /repos/{repo}/rules/branches/main`, which returns
 * what is in force on the branch across every ruleset, unioned with classic
 * branch protection in case a check is ever added that way. Requests carry
 * `GITHUB_TOKEN` when it is set. Actions gives every job one with no secret to
 * configure, and it can read this. Without a token the request is anonymous,
 * which works while the repository is public and is limited to sixty an hour.
 *
 * This check depends on state outside the commit: the same commit can go red
 * when someone edits the ruleset. That is the point — it is the only place the
 * edit becomes visible.
 *
 *   node scripts/check-required-checks.mjs
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { load } from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const WORKFLOW = '.github/workflows/console.yml';
export const BRANCH = 'main';

/**
 * Jobs deliberately not required, each with a reason.
 *
 * A list rather than a rule, so leaving a job out is a decision somebody wrote
 * down. Adding a job means either requiring it in the ruleset once it exists on
 * `main` — requiring it earlier blocks every other pull request, which cannot
 * produce it — or declaring it here. The declaration is the honest way to hold
 * a new job between its merge and the ruleset change; delete it afterwards, or
 * this check fails on the declaration instead.
 */
export const NOT_REQUIRED = {
  e2e:
    'the four shards are gated through e2e-report, which fails unless every shard passed. ' +
    'Requiring shards by name would tie the ruleset to the shard count, so changing the ' +
    'matrix would block every pull request',
  'flake-hunt':
    'runs on the nightly schedule and on manual dispatch only. On a pull request it is ' +
    'skipped, and a required check that is always skipped gates nothing',
};

/**
 * The check-run names a job produces.
 *
 * Its `name`, or its id when it has none; a matrix job reports once per
 * combination, as `name (a, b)`. `include` and `exclude` change the set of
 * combinations in ways this does not model, so they fail loudly rather than
 * produce a wrong list.
 */
export function checkNames(jobId, job) {
  const base = job.name ?? jobId;
  const matrix = job.strategy?.matrix;
  if (!matrix) return [base];
  if (typeof matrix !== 'object' || matrix.include || matrix.exclude) {
    throw new Error(
      `${jobId}: a matrix with include/exclude, or computed by an expression, is not modelled here. ` +
        'Extend checkNames rather than guessing the names GitHub will report.'
    );
  }
  let combos = [[]];
  for (const values of Object.values(matrix)) {
    combos = combos.flatMap((c) => values.map((v) => [...c, v]));
  }
  return combos.map((c) => `${base} (${c.join(', ')})`);
}

/** Every job in the workflow, with the names it reports under. */
export function workflowJobs(text = readFileSync(path.join(root, WORKFLOW), 'utf8')) {
  const doc = load(text);
  return Object.entries(doc.jobs).map(([id, job]) => ({ id, names: checkNames(id, job) }));
}

/**
 * Every way the ruleset and the workflow can disagree.
 *
 * Pure, so each direction can be shown to fail without editing a ruleset.
 */
export function compare({ jobs, required, notRequired = NOT_REQUIRED }) {
  const req = new Set(required);
  const allNames = new Set(jobs.flatMap((j) => j.names));
  const jobIds = new Set(jobs.map((j) => j.id));

  return {
    // Runs on every pull request, blocks nothing.
    unrequired: jobs
      .filter((j) => !(j.id in notRequired))
      .flatMap((j) => j.names)
      .filter((n) => !req.has(n)),
    // Required, produced by no job: every pull request waits for it forever.
    orphaned: [...req].filter((n) => !allNames.has(n)),
    // Declared not required, and required anyway: the declaration is stale.
    staleDeclarations: jobs
      .filter((j) => j.id in notRequired && j.names.some((n) => req.has(n)))
      .map((j) => j.id),
    // A declaration for a job that no longer exists.
    unknownDeclarations: Object.keys(notRequired).filter((id) => !jobIds.has(id)),
  };
}

function repository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' })
    .stdout.trim();
  const match = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
  if (!match) throw new Error(`cannot tell which GitHub repository this is from origin '${url}'`);
  return match[1];
}

async function get(pathname) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${repository()}${pathname}`, { headers });
  if (!res.ok) {
    throw new Error(`GET ${pathname} answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res.json();
}

/** The status checks required on the branch, from rulesets and classic protection. */
export async function requiredChecks(branch = BRANCH) {
  const rules = await get(`/rules/branches/${branch}`);
  const fromRulesets = rules
    .filter((r) => r.type === 'required_status_checks')
    .flatMap((r) => r.parameters.required_status_checks.map((c) => c.context));

  const branchInfo = await get(`/branches/${branch}`);
  const classic = branchInfo.protection?.required_status_checks;
  const fromClassic = [...(classic?.contexts ?? []), ...(classic?.checks ?? []).map((c) => c.context)];

  return [...new Set([...fromRulesets, ...fromClassic])].sort();
}

const isMain =
  process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop());

if (isMain) {
  let required;
  try {
    required = await requiredChecks();
  } catch (err) {
    console.error(
      `Could not read the checks required on ${BRANCH}: ${err.message}\n` +
        'That is a broken gate, not a passing one. In CI, pass GITHUB_TOKEN to this step.'
    );
    process.exit(2);
  }

  const jobs = workflowJobs();
  const { unrequired, orphaned, staleDeclarations, unknownDeclarations } = compare({ jobs, required });

  console.log(`Required on ${BRANCH}: ${required.join(', ') || '(nothing)'}`);
  console.log(`Jobs in ${WORKFLOW}: ${jobs.map((j) => j.id).join(', ')}`);

  const problems = [
    ...unrequired.map(
      (n) =>
        `${n} runs on every pull request and is not required, so a red ${n} can merge. ` +
        'Require it in the ruleset, or declare it in NOT_REQUIRED with a reason.'
    ),
    ...orphaned.map(
      (n) =>
        `${n} is required and no job in ${WORKFLOW} reports it, so every pull request will wait ` +
        'for it forever. Remove it from the ruleset, or restore the job.'
    ),
    ...staleDeclarations.map(
      (id) => `${id} is declared not required, and the ruleset requires it. Delete the declaration.`
    ),
    ...unknownDeclarations.map(
      (id) => `NOT_REQUIRED names ${id}, and no job has that id. Delete the declaration.`
    ),
  ];

  if (problems.length > 0) {
    console.error('\nThe ruleset and the workflow disagree:\n' + problems.map((p) => `  - ${p}`).join('\n'));
    process.exit(1);
  }
  console.log('\nEvery job is required, or declared not required with a reason.');
}
