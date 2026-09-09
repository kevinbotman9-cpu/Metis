import type { FullConfig } from '@playwright/test';

/**
 * Refuse a reused dev server that has been up too long — G-035.
 *
 * `playwright.config.ts` sets `reuseExistingServer: true`, which exists so a
 * local run does not pay a cold start every time. The cost of that is a server
 * that keeps accumulating: on 2026-09-09 one had been up seventeen hours at
 * 2.2 GB resident, and against it `npm run test:a11y` managed **two tests in
 * ten minutes**. Against a freshly started server the same command ran
 * **forty-nine in two minutes forty**. Two full proof runs were measured
 * against that process before anybody thought to look at it, and one of them
 * was thrown away.
 *
 * So the reuse now has a limit, and the limit is stated rather than implied.
 *
 * ## Why two hours
 *
 * It is a judgement, and these are the two numbers it sits between.
 *
 * A cold start costs about thirty seconds. Refusing at two hours therefore
 * costs at most one cold start per two hours of work, which is inside the noise
 * of a session where the suite itself takes fourteen minutes.
 *
 * The only degradation actually observed was at seventeen hours. Two hours is
 * well inside that, and is also longer than any single sitting of
 * edit-and-rerun — so a developer iterating normally should never see this,
 * and a server left up overnight always will.
 *
 * **It is one observation, not a curve.** Nobody has measured where the
 * degradation begins, and the honest way to refine this is to record the
 * server's age alongside the suite duration for a few weeks and look. Until
 * somebody does that, two hours is a guess with a reason rather than a
 * measurement.
 */
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL;
  if (!baseURL) return;

  let uptimeMs: number | undefined;
  try {
    const res = await fetch(`${baseURL}/api/_test/uptime`);
    if (!res.ok) return;
    ({ uptimeMs } = (await res.json()) as { uptimeMs: number });
  } catch {
    // No server, or one that does not answer: Playwright is about to start its
    // own, which is exactly the state this check wants. Nothing to refuse.
    return;
  }

  if (typeof uptimeMs !== 'number' || uptimeMs <= MAX_AGE_MS) return;

  const hours = (uptimeMs / 3_600_000).toFixed(1);
  throw new Error(
    [
      '',
      `The dev server on ${baseURL} has been up for ${hours} hours.`,
      '',
      'Playwright reuses it, and a long-lived one degrades until the suite',
      'measures the server rather than the code: at seventeen hours, the',
      'accessibility suite ran two tests in ten minutes where a fresh server ran',
      'forty-nine in under three. A run against it is not evidence.',
      '',
      'Restart it, then run again. See G-035 in docs/gaps.md.',
      '',
    ].join('\n')
  );
}
