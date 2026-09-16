import { describe, it, expect } from 'vitest';
import { waitForQuietNetwork, settleAll } from '../bundle/settle';

/**
 * The bundle measurement's two waits — G-132.
 *
 * The defect these exist for is not a wrong number, it is a wait with no
 * ceiling: on 2026-09-14 the measurement held `/creatives` for sixty seconds
 * and reported `Test timeout of 60000ms exceeded.` and nothing else, which is
 * why the run cannot say which of the two waits it was. So what is asserted
 * here is the ceiling and the message, not the happy path alone.
 *
 * A fake clock, because a test that waits for real seconds to prove a timeout
 * is a slow test that proves it once.
 *
 * Every sleep here yields a real macrotask rather than a microtask. Awaiting
 * `Promise.resolve()` is enough to advance the code under test, but it starves
 * the timer queue: with a ceiling removed, the loop spun and Vitest's own
 * timeout never fired, so the proof that the ceiling bites hung instead of
 * going red. A check that hangs when its subject breaks is the thing G-132 is
 * about.
 */

/** Yield to the timer queue, so Vitest can time a test out. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function clock() {
  let at = 0;
  return {
    now: () => at,
    sleep: async (ms: number) => {
      at += ms;
      await tick();
    },
    advance: (ms: number) => {
      at += ms;
    },
  };
}

describe('waiting for the page to go quiet', () => {
  it('returns once nothing has been requested for the quiet window, with what it saw', async () => {
    const c = clock();
    let fire: (() => void) | null = null;
    const subscribe = (listener: () => void) => {
      fire = listener;
      return () => {
        fire = null;
      };
    };

    const waiting = waitForQuietNetwork(subscribe, {
      quietMs: 500,
      capMs: 20_000,
      now: c.now,
      sleep: async (ms) => {
        // Three requests arrive while waiting, then silence.
        c.advance(ms);
        if (c.now() < 200) fire?.();
        await tick();
      },
    });

    const quiet = await waiting;
    // One per 50ms poll while the clock is under 200ms: 50, 100, 150.
    expect(quiet.requests).toBe(3);
    expect(quiet.waitedMs).toBeGreaterThanOrEqual(500);
    // The listener is taken back: a subscription that outlives the wait would
    // count the next route's requests.
    expect(fire).toBeNull();
  });

  it('fails at the ceiling, saying which route, how many requests and how long ago', async () => {
    // A page that never stops: every poll finds a new request.
    const c = clock();
    let fired: (() => void) | null = null;
    await expect(
      waitForQuietNetwork(
        (listener) => {
          fired = listener;
          return () => {};
        },
        {
          quietMs: 500,
          capMs: 2_000,
          label: '/creatives',
          now: c.now,
          sleep: async (ms) => {
            c.advance(ms);
            fired?.();
            await tick();
          },
        }
      )
    ).rejects.toThrow(/\/creatives was still requesting after \d+ms: \d+ requests/);
  });

  it('names itself as the wait that held the measurement, so a bare timeout is not the only evidence', async () => {
    const c = clock();
    let fired: (() => void) | null = null;
    const failure = await waitForQuietNetwork(
      (listener) => {
        fired = listener;
        return () => {};
      },
      {
        quietMs: 500,
        capMs: 1_000,
        label: '/offers',
        now: c.now,
        sleep: async (ms) => {
          c.advance(ms);
          fired?.();
          await tick();
        },
      }
    ).catch((e: Error) => e);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain('not the body reads, and not teardown (G-132)');
  });
});

describe('waiting for the response bodies', () => {
  it('returns when every read has settled, a rejected one included', async () => {
    const c = clock();
    await settleAll([Promise.resolve('a'), Promise.reject(new Error('body gone')).catch(() => 'b')], {
      capMs: 1_000,
      now: c.now,
      sleep: c.sleep,
    });
    // Reaching here is the assertion: a rejected read must not hold the wait
    // and must not become an unhandled rejection.
    expect(c.now()).toBeLessThan(1_000);
  });

  it('fails at the ceiling, saying how many bodies never came back', async () => {
    const c = clock();
    const never = new Promise<void>(() => {});
    await expect(
      settleAll([Promise.resolve(), never, never], {
        capMs: 500,
        label: '/decisions',
        now: c.now,
        sleep: c.sleep,
      })
    ).rejects.toThrow(/\/decisions had 2 of 3 response bodies unread after \d+ms/);
  });
});
