import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';

/**
 * The nightly flake hunt runs four passes, and all four have to happen.
 *
 * Run #33 was the first time it ever fired. The four runs were a plain `run:`
 * chain, so Run 1's failure ended the job and Runs 2, 3 and **Run 4 — shuffled
 * group order** were skipped. Run 4 is the only step that varies which specs
 * have run before which; it is the reason the job exists, and it had never
 * executed. One sample, reported as a night's work.
 *
 * The upload was worse because it looked like it worked: the step went green
 * having found nothing, because `--reporter=line` replaces the config's json
 * reporter and the path named the *html* reporter's directory, which nothing
 * here writes. The trace of the failure was captured and then discarded.
 *
 * This is a structural check on a YAML file, which is a weak kind of check —
 * it cannot tell you the job works, only that the shape it needs is still
 * there. That is worth having anyway: every property below was absent for the
 * life of the job and nothing said so, and each is one careless edit from
 * being absent again. The end-to-end proof is a `workflow_dispatch` with a
 * deliberately failing Run 1; see [G-054](../docs/gaps.md).
 */

const WORKFLOW = resolve(__dirname, '../.github/workflows/console.yml');

interface Step {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  with?: Record<string, unknown>;
  'continue-on-error'?: boolean;
}

const job = () => {
  const doc = load(readFileSync(WORKFLOW, 'utf8')) as {
    jobs: Record<string, { steps: Step[] }>;
  };
  const hunt = doc.jobs['flake-hunt'];
  expect(hunt, 'the flake-hunt job is gone').toBeTruthy();
  return hunt;
};

const runSteps = (steps: Step[]) => steps.filter((s) => /^Run \d/.test(s.name ?? ''));

describe('the flake hunt', () => {
  it('has four runs, and the fourth varies the order', () => {
    // Three identical passes catch a test that fails on timing; the fourth
    // catches a test that only passes because something else ran first. They
    // are different failures and the job needs both.
    const steps = runSteps(job().steps);
    expect(steps.map((s) => s.name)).toHaveLength(4);
    expect(steps[3].name, 'the fourth run no longer says it shuffles').toMatch(/shuffl/i);
    expect(steps[3].run, 'the fourth run does not actually shuffle').toMatch(/shuf/);
  });

  it('lets every run happen even when an earlier one fails', () => {
    // The defect, as a check. Without `continue-on-error` a failure ends the
    // job and the remaining runs are skipped — which is what happened, and
    // meant the shuffled run had never once executed.
    const steps = runSteps(job().steps);
    const gating = steps.filter((s) => s['continue-on-error'] !== true).map((s) => s.name);
    expect(gating, 'these runs stop the ones after them').toEqual([]);

    // And each is addressable, or the gate below cannot read its result.
    expect(steps.map((s) => s.id)).toEqual(['run1', 'run2', 'run3', 'run4']);
  });

  it('still fails the job when a run fails', () => {
    // `continue-on-error` on its own turns a red hunt green, which would be a
    // worse bug than the one it fixes: a job that cannot fail is a job nobody
    // needs to run. Something after the runs has to read all four outcomes.
    const steps = job().steps;
    const gate = steps[steps.length - 1];
    expect(gate.if, 'the gate does not run when a step failed').toMatch(/always\(\)/);
    for (const id of ['run1', 'run2', 'run3', 'run4']) {
      expect(gate.run ?? '', `the gate ignores ${id}`).toContain(`steps.${id}.outcome`);
    }
  });

  it('keeps the evidence of what failed', () => {
    const steps = job().steps;
    const upload = steps.find((s) => /upload/i.test(s.name ?? ''));
    expect(upload, 'nothing uploads the report').toBeTruthy();

    // `if: failure()` stopped working the moment the runs became
    // `continue-on-error` — the job is not failing yet when this step runs.
    expect(upload!.if, 'the upload will not fire').toMatch(/always\(\)/);

    // The paths a run actually writes. `playwright-report` is the html
    // reporter's directory and nothing here produces it; that is what #33
    // uploaded, and it found no files.
    const path = String(upload!.with?.path ?? '');
    expect(path, 'still pointed at a directory nothing writes').not.toMatch(/playwright-report/);
    expect(path, 'the traces and screenshots are not collected').toContain('test-results');
    expect(path, 'the machine-readable result is not collected').toMatch(/playwright-results/);
  });

  it('gives each run its own result file', () => {
    // Four runs writing one filename means the artefact describes whichever
    // ran last, which for a hunt is the least interesting one.
    const steps = runSteps(job().steps);
    const named = steps.map((s) =>
      s.id === 'run4'
        ? /PLAYWRIGHT_JSON_OUTPUT_NAME=/.test(s.run ?? '')
        : Boolean((s as { env?: Record<string, string> }).env?.PLAYWRIGHT_JSON_OUTPUT_NAME)
    );
    expect(named, 'a run shares its result file with another').toEqual([true, true, true, true]);
  });

  it('does not override the reporter on the command line', () => {
    // `--reporter=line` replaces the config's list outright, so the json
    // reporter never ran and `playwright-results.json` was never written. The
    // config is where the reporters are chosen; the workflow should not have
    // an opinion.
    for (const step of runSteps(job().steps)) {
      expect(step.run ?? '', `${step.name} overrides the reporter`).not.toMatch(/--reporter/);
    }
  });
});
