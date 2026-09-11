import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
// @ts-expect-error — plain ESM with no types; the shape is asserted below.
import { GATES, NOT_A_GATE } from '../scripts/gates.mjs';

/**
 * `npm run gates` and CI run the same thing, and stay that way.
 *
 * Before this existed the two had drifted badly and silently. The root lint
 * ran nowhere on a pull request, because `verify` defaults to
 * `working-directory: apps/console` and its `Lint` step therefore linted the
 * console — twice, counting the step after it. `test:core`, `test:catalogue`
 * and `test:portability` were in the root `npm test` chain and in no workflow
 * step. `npm run conformance`, which CLAUDE.md tells every session to run at
 * both ends, was not a script at all.
 *
 * None of that could be seen from a terminal. Running the obvious commands and
 * getting green meant having checked some subset of CI, and the only way to
 * find out which was to read the workflow.
 *
 * So the two lists are held to each other here. A step added to the workflow
 * fails this until it is declared a gate or classified as infrastructure with a
 * reason; a gate removed from the script fails it too. Neither can move alone.
 */

const root = resolve(__dirname, '..');
const WORKFLOW = resolve(root, '.github/workflows/console.yml');

interface Gate {
  id: string;
  label: string;
  cwd: string;
  command: string;
  ci?: string;
}

/** The jobs whose steps are gates. */
const GATE_JOBS = ['verify', 'e2e', 'spec'] as const;

/**
 * Jobs deliberately outside `npm run gates`, each with a reason.
 *
 * A list rather than a predicate, so adding a job is a decision somebody writes
 * down instead of a silent exemption.
 */
const OUT_OF_SCOPE: Record<string, string> = {
  'e2e-report':
    'merges shard reports and gates on the shards; it has nothing to run on one machine, where the suite is not sharded',
  'kotlin-conformance':
    'a second engine behind a JVM toolchain. Worth running and not worth making every console change wait for Gradle; it is a required check on the PR',
  'flake-hunt': 'the nightly four-pass hunt, deliberately not part of a per-change gate',
};

interface Step {
  name?: string;
  run?: string;
  'working-directory'?: string;
}

function workflowCommands(): { job: string; name: string; command: string }[] {
  const doc = load(readFileSync(WORKFLOW, 'utf8')) as {
    jobs: Record<string, { steps: Step[] }>;
  };
  const out: { job: string; name: string; command: string }[] = [];
  for (const job of GATE_JOBS) {
    for (const step of doc.jobs[job]?.steps ?? []) {
      if (!step.run) continue;
      out.push({
        job,
        name: step.name ?? '(unnamed)',
        // Collapsed so a multi-line block scalar compares as one string.
        command: step.run.split('\n').join(' ').split(/\s+/).filter(Boolean).join(' '),
      });
    }
  }
  return out;
}

/** What the workflow would have to say to run this gate. */
const ciForm = (g: Gate) => g.ci ?? g.command;

describe('the local gate and the CI gate are the same gate', () => {
  const gates = GATES as Gate[];

  it('has gates at all, with the fields the runner needs', () => {
    // A guard on the guard: an empty list would make every comparison below
    // pass over two empty sets.
    expect(gates.length).toBeGreaterThan(10);
    for (const g of gates) {
      expect(g.id, `a gate has no id: ${JSON.stringify(g)}`).toBeTruthy();
      expect(g.command, `${g.id} has no command`).toBeTruthy();
      expect(g.cwd, `${g.id} has no cwd`).toBeTruthy();
    }
    expect(new Set(gates.map((g) => g.id)).size, 'two gates share an id').toBe(gates.length);
  });

  it('runs nothing CI does not', () => {
    const inCi = new Set(workflowCommands().map((c) => c.command));
    const extra = gates.filter((g) => !inCi.has(ciForm(g)));
    expect(
      extra.map((g) => `${g.id}: ${ciForm(g)}`),
      'these gates run locally and in no CI job'
    ).toEqual([]);
  });

  it('runs everything CI does', () => {
    const declared = new Set(gates.map(ciForm));
    const infrastructure = new Set(Object.keys(NOT_A_GATE as Record<string, string>));

    const unclaimed = workflowCommands().filter(
      (c) => !declared.has(c.command) && !infrastructure.has(c.command)
    );

    expect(
      unclaimed.map((c) => `${c.job} › ${c.name}: ${c.command}`),
      'CI runs these and `npm run gates` does not — add them to GATES, or to NOT_A_GATE with a reason'
    ).toEqual([]);
  });

  it('gives every non-gate step a reason', () => {
    // `NOT_A_GATE` is an escape hatch, and an escape hatch with no cost is a
    // hole. Each entry has to say why the step is setup rather than a check.
    for (const [command, reason] of Object.entries(NOT_A_GATE as Record<string, string>)) {
      expect(reason, `${command} is exempted with no reason`).toBeTruthy();
      expect(String(reason).length, `${command}'s reason says nothing`).toBeGreaterThan(20);
    }
  });

  it('runs each job’s gates in the order that job runs them', () => {
    // Order is not cosmetic: both CI and the runner stop at the first failure,
    // so it decides which failure a person sees first. A local run that
    // typechecked last would report a lint error on code that does not compile.
    //
    // Compared **within a job**, not across all of them. `verify`, `e2e` and
    // `spec` are parallel jobs, so there is no global order to compare against
    // — flattening them invents one, and the first version of this assertion
    // failed on that invention rather than on any real drift.
    const commands = workflowCommands();
    for (const job of GATE_JOBS) {
      const inJob = commands.filter((c) => c.job === job).map((c) => c.command);
      const local = gates.map(ciForm).filter((c) => inJob.includes(c));
      const ci = inJob.filter((c) => local.includes(c));
      expect(local, `GATES runs ${job}'s gates in a different order from ${job}`).toEqual(ci);
    }
  });

  it('accounts for every job in the workflow', () => {
    const doc = load(readFileSync(WORKFLOW, 'utf8')) as { jobs: Record<string, unknown> };
    const known = new Set<string>([...GATE_JOBS, ...Object.keys(OUT_OF_SCOPE)]);
    const unaccounted = Object.keys(doc.jobs).filter((j) => !known.has(j));
    expect(
      unaccounted,
      'a job is neither a gate job nor declared out of scope, so nobody knows whether it runs locally'
    ).toEqual([]);
  });

  it('names a script CLAUDE.md can point at', () => {
    // The rule in Session Discipline says gates are reported by running
    // `npm run gates`. If the script were renamed, that instruction would send
    // the next session to a command that does not exist — which is exactly what
    // `npm run conformance` did for months.
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.gates, 'there is no `npm run gates`').toBeTruthy();
    expect(pkg.scripts.conformance, 'there is still no `npm run conformance`').toBeTruthy();
    expect(readFileSync(resolve(root, 'CLAUDE.md'), 'utf8')).toContain('npm run gates');
  });
});
