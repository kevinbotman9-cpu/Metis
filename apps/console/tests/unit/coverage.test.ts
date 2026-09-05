import { describe, it, expect } from 'vitest';
import { coverageLabel } from '@/components/ui/coverage-bar';

/**
 * Coverage is the one figure on the catalogue page that changes what someone
 * does next, so the distinctions it draws are worth pinning.
 *
 * Three states, not two. "Some coverage" and "no coverage" are different
 * amounts of the same thing; "not applicable" is a different kind of thing,
 * and a retired offer that reads "0 of 5" would be reporting a problem that
 * cannot exist.
 */
describe('coverage label', () => {
  it('counts what is covered against what could be', () => {
    expect(coverageLabel(2, 5)).toBe('2 of 5 channels');
  });

  it('names the unit, because the list and the drawer count different things', () => {
    // The list only knows how many creatives exist, not which channels they
    // are on. Saying "channels" there would claim more than the data supports.
    expect(coverageLabel(3, 5, true, 'creatives')).toBe('3 of 5 creatives');
  });

  it('says why zero matters rather than reporting it as a quantity', () => {
    // "0 of 5" is true and useless. This is the sentence that tells someone
    // the publish will be refused.
    expect(coverageLabel(0, 5)).toBe('no creative — cannot be delivered');
  });

  it('does not report coverage for an offer that can never be selected', () => {
    // A retired offer has no creatives and that is correct, not broken.
    expect(coverageLabel(0, 0, false)).toBe('not applicable');
  });

  it('treats a selectable offer with no channels as not applicable, not as blocked', () => {
    // total 0 wins over covered 0: if nothing could be covered, nothing is
    // missing.
    expect(coverageLabel(0, 0, true)).toBe('not applicable');
  });

  it('reports full coverage plainly', () => {
    expect(coverageLabel(5, 5)).toBe('5 of 5 channels');
  });
});
