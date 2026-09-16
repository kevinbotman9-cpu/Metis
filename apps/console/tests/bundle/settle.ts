/**
 * Bounded waits for the bundle-budget measurement — G-132.
 *
 * The measurement had two waits with no ceiling: `waitUntil: 'networkidle'`,
 * which resolves when the page has been quiet for 500ms and otherwise waits as
 * long as the test allows, and `Promise.all` over a response body read per
 * chunk. On 2026-09-14 one of them held `/creatives` for sixty seconds and the
 * run failed with `Test timeout of 60000ms exceeded.` and nothing else: the
 * page snapshot in the artifact shows the route fully rendered, and the byte
 * total it printed at the end matches the passing re-run exactly, so the page
 * had loaded and every chunk had been read. Which of the two waits held it is
 * not recoverable from that run.
 *
 * These two do the same waiting with a ceiling and a message. A stall now fails
 * saying which wait it was, how long it had waited and what was still
 * outstanding, which is what the next occurrence needs in order to be diagnosed
 * rather than retried.
 */

/** Subscribe to an event; the returned function unsubscribes. */
export type Subscribe = (listener: () => void) => () => void;

export interface QuietNetwork {
  /** How long from the first wait to the quiet window closing. */
  waitedMs: number;
  /** Requests seen while waiting. */
  requests: number;
}

export interface QuietOptions {
  /** How long the page must stay silent. Playwright's `networkidle` uses 500ms. */
  quietMs?: number;
  /** The ceiling. Past this the wait fails rather than running to the test timeout. */
  capMs?: number;
  /** Named in the failure, so the message says which route was waiting. */
  label?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wait until no request has started for `quietMs`, or fail at `capMs`.
 *
 * The check is a poll rather than a timer per request: a timer reset by every
 * request is the same loop with the reset hidden, and this way the failure can
 * say how many requests it saw.
 */
export async function waitForQuietNetwork(
  subscribe: Subscribe,
  { quietMs = 500, capMs = 20_000, label = 'the page', now = Date.now, sleep = realSleep }: QuietOptions = {}
): Promise<QuietNetwork> {
  const started = now();
  let last = started;
  let requests = 0;
  const stop = subscribe(() => {
    requests += 1;
    last = now();
  });

  try {
    for (;;) {
      const at = now();
      if (at - last >= quietMs) return { waitedMs: at - started, requests };
      if (at - started >= capMs) {
        throw new Error(
          `${label} was still requesting after ${at - started}ms: ${requests} requests, the last ` +
            `${at - last}ms ago, and the page never went quiet for ${quietMs}ms. The measurement ` +
            'waits for quiet before counting, so this is the wait that held it — not the body ' +
            'reads, and not teardown (G-132).'
        );
      }
      await sleep(Math.min(50, quietMs));
    }
  } finally {
    stop();
  }
}

export interface SettleOptions {
  capMs?: number;
  label?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Await every body read, or fail at `capMs` saying how many never came back.
 *
 * A response whose body is gone is already tolerated by the caller; this is
 * about one that never answers, which `Promise.all` would wait on until the
 * test timeout.
 */
export async function settleAll<T>(
  reads: Promise<T>[],
  { capMs = 20_000, label = 'the page', now = Date.now, sleep = realSleep }: SettleOptions = {}
): Promise<void> {
  const started = now();
  let outstanding = reads.length;
  const done = reads.map((read) =>
    read.then(
      () => {
        outstanding -= 1;
      },
      () => {
        outstanding -= 1;
      }
    )
  );

  const cap = (async () => {
    for (;;) {
      if (outstanding === 0) return;
      if (now() - started >= capMs) {
        throw new Error(
          `${label} had ${outstanding} of ${reads.length} response bodies unread after ` +
            `${now() - started}ms. The measurement counts bytes from the bodies, so this is the ` +
            'wait that held it — not the navigation, and not teardown (G-132).'
        );
      }
      await sleep(25);
    }
  })();

  await Promise.race([Promise.all(done), cap]);
}
