import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute, replay } from '../src/deterministic/engine';

/**
 * A replay reproduces the slate that was returned, whatever the placement says
 * today — ADR-020 §2.
 *
 * The slot count is recorded on the decision and read back by replay. Until the
 * reseed it was not recorded at all, and changing `weekly_offers_send` from two
 * slots to one would have made 742 recorded decisions replay a slate other than
 * the one they returned.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(
  fs.readFileSync(path.resolve(here, '../../../docs/conformance/decision-corpus.json'), 'utf8')
) as { cases: { name: string; artifact: never; catalogue: never; request: { input: Record<string, unknown>; slotCount?: number } }[] };

const multi = corpus.cases.filter((c) => (c.request.slotCount ?? 1) > 1);

describe('replaying a decision that showed more than one offer', () => {
  it('has a case to replay', () => {
    expect(multi.length).toBeGreaterThan(0);
  });

  for (const c of multi) {
    it(`replays identically: ${c.name}`, () => {
      const original = execute(c.artifact, c.catalogue, c.request as never);
      expect(original.decision.slate.length).toBeGreaterThan(1);
      const result = replay(c.artifact, c.catalogue, original, c.request.input);
      expect(result.identical, JSON.stringify(result.differences)).toBe(true);
    });
  }
});
