import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { artifacts } from '@/mocks/fixtures/artifacts';
import { creatives, placements } from '@/mocks/fixtures/catalogue';

/**
 * The storefront demo names flows and placements. This asserts they exist.
 *
 * The page is a plain file under public/ — no build step, no imports, nothing
 * that fails to compile when a fixture is renamed. Without this, renaming a
 * flow or a placement leaves the demo showing empty slots, and the first person
 * to find out is whoever is presenting it.
 *
 * It checks the names and nothing else. What the page renders is the platform's
 * answer, and asserting on that here would only be re-testing the engine.
 */

const html = fs.readFileSync(
  path.resolve(__dirname, '../../public/storefront/index.html'),
  'utf8'
);

/** The PLACEMENTS table, read out of the page. */
const declared = [...html.matchAll(/\{\s*id:\s*'([\w-]+)',\s*view:\s*'(\w+)'/g)].map(
  (m) => ({ placement: m[1], view: m[2] })
);

describe('the storefront demo names things that exist', () => {
  it('declares the four placements the page has slots for', () => {
    expect(declared).toHaveLength(4);
    for (const d of declared) {
      expect(html, `no slot element for ${d.placement}`).toContain(`id="slot-${d.placement}"`);
    }
  });

  it('names placements the platform has configured, and active ones', () => {
    // The page used to carry an `artifactId` per slot — configuration a website
    // has no business holding. It now names slots only, so this asserts the
    // slots exist rather than that the page picked the right flow.
    for (const { placement } of declared) {
      const configured = placements.find((p) => p.key === placement);
      expect(configured, `the page asks for ${placement}, which is not configured`).toBeDefined();
      expect(configured?.active, `${placement} is configured but inactive`).toBe(true);
    }
  });

  it('every configured placement is answered by an active flow', () => {
    // A draft flow deciding on a live site would be a real defect, not a
    // cosmetic one: nothing else in the stack stops it.
    for (const p of placements.filter((x) => x.active)) {
      const flow = artifacts.find((a) => a.id === p.artifactId);
      expect(flow, `${p.key} names ${p.artifactId}, which is not a flow`).toBeDefined();
      expect(flow?.status, `${p.key} names ${p.artifactId}, which is ${flow?.status}`).toBe(
        'active'
      );
    }
  });

  it('asks for slot shapes some web creative was designed for', () => {
    // A creative names the *shape* it is for — hero, tile, feature band — and a
    // slot declares the shape it renders in. So the join is on the type, not
    // the slot key: one hero creative serves every hero placement. Asserting
    // the old way would require a creative per page, which is not how anyone
    // writes them.
    const designedFor = new Set(
      creatives
        .filter((c) => c.channel === 'web' && c.active)
        .map((c) => (c.content as { placement?: string }).placement)
        .filter(Boolean)
    );

    for (const { placement } of declared) {
      const slot = placements.find((p) => p.key === placement);
      expect(slot?.type, `${placement} declares no placement type`).toBeTruthy();
      expect(
        designedFor,
        `nothing is designed for a ${slot?.type}, which ${placement} renders`
      ).toContain(slot?.type);
    }
  });

  it('sends every input the tenant policies read', () => {
    // A preset missing a field does not error — the condition simply never
    // matches, and the offer silently stops appearing. Cheaper to catch here.
    const fields = ['bill_to_income_ratio', 'arrears_count_12mo', 'fibre_available',
      'pct_of_allowance_3mo_avg', 'months_of_history', 'days_to_end',
      'pac_requested_within_days', 'residual_value', 'monthly_delta'];
    const presets = html.slice(html.indexOf('const PRESETS'), html.indexOf('// ---------------------------------------------------------------- state'));
    const count = (needle: string) => presets.split(needle).length - 1;

    // Five presets, every field in each.
    expect(count('customerId:')).toBe(5);
    for (const f of fields) {
      expect(count(f), `${f} is not in all five presets`).toBe(5);
    }
  });
});
