import { describe, it, expect } from 'vitest';
import { placementDescriptor, placementsLayout, type ListDetailManifest } from '@metis/ui-metadata';
import { placements } from '@/mocks/fixtures/catalogue';
import {
  applyFilter,
  cell,
  columnsOf,
  countLabel,
  display,
  facetOptions,
  openRow,
  sortRows,
  step,
  NO_FILTER,
} from '@/lib/layouts/list';
import type { Row } from '@/lib/layouts/sources';

/**
 * The list–detail renderer's rules, run against the real Placement descriptor,
 * the real manifest and the seeded placements — so a test that passes is the
 * screen behaving, not a story about it.
 *
 * The seeded tenant has nine placements: five on web (one refusing requests),
 * and email, SMS, push and outbound call one each. Four deliver nothing, and
 * three of those four still decide.
 */

const manifest = placementsLayout as ListDetailManifest;
const rows = placements as unknown as Row[];
const field = (name: string) => placementDescriptor.fields.find((f) => f.field === name)!;
const keys = (rs: readonly Row[]) => rs.map((r) => r.key);
const flows = { flows: [{ value: 'inbound-web-offers', label: 'Inbound web offers', href: '/decision-flows/inbound-web-offers' }] };

describe('a value reads in the descriptor’s words', () => {
  it('shortens an option on a row and keeps the sentence in the overview', () => {
    expect(display(field('delivery.mode'), undefined, {}, true).text).toBe('Nothing');
    expect(display(field('delivery.mode'), undefined, {}).text).toBe('Nothing — decides, and nobody sends it');
    expect(display(field('delivery.mode'), 'caller', {}, true).text).toBe('Whoever asked');
  });

  it('names a boolean by its labels, not true and false', () => {
    expect(display(field('decidable'), true, {}).text).toBe('Decides');
    expect(display(field('decidable'), false, {}).text).toBe('Refuses requests');
  });

  it('names a chosen record, and links to it', () => {
    expect(display(field('artifactId'), 'inbound-web-offers', flows)).toEqual({
      text: 'Inbound web offers',
      href: '/decision-flows/inbound-web-offers',
    });
  });

  it('shows the raw value when the chosen record is not among the options, rather than nothing', () => {
    expect(display(field('artifactId'), 'retired-flow', flows)).toEqual({ text: 'retired-flow' });
  });

  it('says a missing value is not set, and never shows it as a zero', () => {
    expect(display(field('description'), undefined, {})).toEqual({ text: 'Not set', empty: true });
    expect(display(undefined, '', {})).toEqual({ text: 'Not set', empty: true });
  });

  it('counts with a unit, so a number does not stand alone', () => {
    const slots = columnsOf(manifest, placementDescriptor).find((c) => c.field === 'slotCount')!;
    expect(cell(rows.find((r) => r.key === 'homepage_hero')!, slots, {}).text).toBe('1 slot');
    expect(cell(rows.find((r) => r.key === 'homepage_grid')!, slots, {}).text).toBe('3 slots');
  });

  it('shows a row the short form, which is what fits in a 20rem pane', () => {
    const delivered = columnsOf(manifest, placementDescriptor).find((c) => c.field === 'delivery.mode')!;
    expect(cell(rows.find((r) => r.key === 'homepage_hero')!, delivered, {}).text).toBe('Whoever asked');
    expect(cell(rows.find((r) => r.key === 'app_inbox')!, delivered, {}).text).toBe('Nothing');
  });

  it('labels a column from the descriptor', () => {
    expect(columnsOf(manifest, placementDescriptor).map((c) => c.label)).toEqual([
      'Channel',
      'Decide for this slot',
      'Delivered by',
      'Slots',
    ]);
  });
});

describe('filtering', () => {
  it('keeps everything, in the manifest’s order, until somebody filters', () => {
    const { rows: kept } = applyFilter(rows, NO_FILTER, manifest, placementDescriptor, {});
    expect(keys(kept)).toEqual([
      'weekly_offers_send',
      'retention_queue',
      'app_inbox',
      'triggered_outbound',
      'homepage_hero',
      'homepage_grid',
      'account_dashboard_hero',
      'usage_page_inline',
      'basket_upsell',
    ]);
  });

  it('matches typed text against the name, the key and what each column shows', () => {
    const by = (query: string) => keys(applyFilter(rows, { query, facets: {} }, manifest, placementDescriptor, {}).rows);
    expect(by('grid')).toEqual(['homepage_grid']);
    expect(by('TRIGGERED_out')).toEqual(['triggered_outbound']);
    // "Nothing" is the delivered-by column as a row shows it.
    expect(by('nothing')).toEqual(['weekly_offers_send', 'retention_queue', 'app_inbox', 'triggered_outbound']);
  });

  it('keeps only the chosen value of a facet, including the empty one', () => {
    const kept = applyFilter(rows, { query: '', facets: { 'delivery.mode': '' } }, manifest, placementDescriptor, {});
    expect(keys(kept.rows)).toEqual(['weekly_offers_send', 'retention_queue', 'app_inbox', 'triggered_outbound']);
  });

  it('counts each facet value over everything else chosen, never over its own choice', () => {
    const { rows: kept, counts } = applyFilter(
      rows,
      { query: '', facets: { decidable: 'true' } },
      manifest,
      placementDescriptor,
      {}
    );
    expect(kept).toHaveLength(7);
    // Its own facet still shows both answers, or choosing one would hide the other.
    expect(counts.decidable).toEqual({ true: 7, false: 2 });
    // The other facets count only what deciding leaves.
    expect(counts.channel).toEqual({ web: 4, email: 1, sms: 1, push: 1, outbound_call: 0 });
    expect(counts['delivery.mode']).toEqual({ '': 3, caller: 4, adapter: 0 });
  });

  it('offers every value the descriptor declares, with a zero where nothing has it', () => {
    const { counts } = applyFilter(rows, NO_FILTER, manifest, placementDescriptor, {});
    expect(counts['delivery.mode'].adapter).toBe(0);
    expect(facetOptions(field('delivery.mode')).map((o) => o.label)).toEqual(['Nothing', 'Whoever asked', 'An adapter']);
    expect(facetOptions(field('decidable')).map((o) => o.label)).toEqual(['Decides', 'Refuses requests']);
  });

  it('says how many of how many', () => {
    expect(countLabel(9, 9, placementDescriptor.noun)).toBe('9 placements');
    expect(countLabel(2, 9, placementDescriptor.noun)).toBe('2 of 9 placements');
    expect(countLabel(1, 1, placementDescriptor.noun)).toBe('1 placement');
  });
});

describe('selection', () => {
  const ids = ['a', 'b', 'c'];

  it('moves one at a time and stops at either end rather than wrapping', () => {
    expect(step(ids, 'a', 1)).toBe('b');
    expect(step(ids, 'c', 1)).toBe('c');
    expect(step(ids, 'a', -1)).toBe('a');
    expect(step(ids, 'b', 'last')).toBe('c');
    expect(step(ids, 'b', 'first')).toBe('a');
  });

  it('starts from the top when nothing in view is selected', () => {
    expect(step(ids, null, 1)).toBe('a');
    expect(step(ids, 'filtered-out', 1)).toBe('a');
    expect(step([], 'a', 1)).toBeNull();
  });

  it('opens the record the URL names while it is in view, and the first one otherwise', () => {
    const identity = (r: Row) => String(r.key);
    const sorted = sortRows(rows, manifest);
    expect(openRow(sorted, identity, 'app_inbox')?.key).toBe('app_inbox');
    expect(openRow(sorted, identity, 'gone')?.key).toBe('weekly_offers_send');
    expect(openRow([], identity, 'app_inbox')).toBeNull();
  });
});
