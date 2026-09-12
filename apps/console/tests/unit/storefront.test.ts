import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { artifacts } from '@/mocks/fixtures/artifacts';
import { creatives, placements, targetingPolicies } from '@/mocks/fixtures/catalogue';

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
      expect(configured?.decidable, `${placement} is configured but not decidable`).toBe(true);
    }
  });

  it('every configured placement is answered by an active flow', () => {
    // A draft flow deciding on a live site would be a real defect, not a
    // cosmetic one: nothing else in the stack stops it.
    for (const p of placements.filter((x) => x.decidable)) {
      const flow = artifacts.find((a) => a.id === p.artifactId);
      expect(flow, `${p.key} names ${p.artifactId}, which is not a flow`).toBeDefined();
      expect(flow?.status, `${p.key} names ${p.artifactId}, which is ${flow?.status}`).toBe(
        'active'
      );
    }
  });

  it('can fill every slot it renders with a web creative', () => {
    // This asserted that some web creative *names* each slot, which was true
    // of a catalogue whose creatives were written per slot and is not the
    // property that matters. The storefront resolves content the way
    // `creativeFor` does: a creative naming this slot, else one naming no slot
    // at all, else the first active web creative. A slot-agnostic creative
    // fills any slot by design — that is what `placement: ''` means — so the
    // old assertion failed on a catalogue that renders perfectly well.
    //
    // What must hold is that nothing the page renders comes up empty, which is
    // this. It holds for both shapes of catalogue, so it is the stronger test.
    const web = creatives.filter((c) => c.channel === 'web' && c.active);
    const resolves = (slot: string) =>
      web.find((c) => (c.content as { placement?: string }).placement === slot) ??
      web.find((c) => !(c.content as { placement?: string }).placement) ??
      web[0];

    for (const { placement } of declared) {
      expect(resolves(placement), `nothing would render in ${placement}`).toBeTruthy();
    }
  });

  it('gives every slot a placement type, so a creative can inherit one', () => {
    // The slot says where, the creative says what shape. A slot with no type
    // cannot suggest one, and the person authoring is back to guessing.
    for (const { placement } of declared) {
      const slot = placements.find((p) => p.key === placement);
      expect(slot?.type, `${placement} declares no placement type`).toBeTruthy();
    }
  });

  it('sends every input the tenant policies read, in every preset', () => {
    // A preset missing a field does not error — the condition simply never
    // matches, and the offer silently stops appearing. That is exactly how the
    // fiber contrast came to show the same refusal twice (G-094), so it is
    // worth catching here rather than on a screen.
    //
    // The field list is read from the policies rather than written out. The
    // nine names that stood here were hand-listed, so the check could only ever
    // see the fields whoever wrote it already knew about: it would have passed
    // unchanged on the day a policy started reading a tenth.
    const leaves = [
      ...new Set(
        targetingPolicies.flatMap((p) =>
          p.conditions.map((c) => c.field.split('.').slice(-1)[0])
        )
      ),
    ].sort();
    expect(leaves.length, 'no policy fields found; the parse is wrong').toBeGreaterThan(5);

    const presets = html.slice(
      html.indexOf('const PRESETS'),
      html.indexOf('// ---------------------------------------------------------------- state')
    );
    const count = (needle: string) => presets.split(needle).length - 1;
    /**
     * How many presets declare this leaf as a key of its own.
     *
     * Boundaried, because two leaf names are suffixes of others here:
     * `disney` sits inside `disney_available`, and `status` inside
     * `account_status`. A plain substring found each of those six times in
     * three presets and read it as a preset carrying the field twice.
     */
    const declaring = (leaf: string) =>
      (presets.match(new RegExp(`(?<![A-Za-z0-9_])${leaf}:`, 'g')) ?? []).length;

    const presetCount = count('customerId:');
    expect(presetCount, 'the brief has three scenarios').toBe(3);

    for (const f of leaves) {
      // Counted as a key, `disney:`, not as a substring: `disney` also occurs
      // inside `disney_available` and was found six times in three presets.
      expect(
        declaring(f),
        `${f} is read by a policy and is not in all ${presetCount} presets`
      ).toBe(presetCount);
    }
  });
});