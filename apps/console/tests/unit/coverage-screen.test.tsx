// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { StaticFormatProvider } from '@/components/tenant-format';
import { CreativeCoverage } from '@/components/creative-coverage';
import { CELL } from '@/lib/coverage';
import type { CreativeDto, OfferDto, PlacementDto } from '@/lib/api-client';

/**
 * The coverage screen as a Cascade: its rail's stages, what a selected stage
 * puts in the middle pane, and the evidence quote. The arithmetic is held in
 * `coverage.test.ts`; these hold that the screen says what the arithmetic
 * found, in the legend's own words, and nothing it did not.
 */

afterEach(cleanup);

const SETTINGS = { locale: 'en-US', currency: 'USD' } as const;

const offer = (id: string, status = 'active') => ({ id, key: id, name: id, status }) as unknown as OfferDto;
const creative = (offerId: string, channel: string, active: boolean) =>
  ({ id: `${offerId}_${channel}`, offerId, channel, active }) as unknown as CreativeDto;
const placement = (channel: string, delivery: boolean) =>
  ({ id: `pl_${channel}`, channel, delivery: delivery ? 'push' : null, decidable: true }) as unknown as PlacementDto;

const props = {
  placements: [placement('web', true), placement('email', true), placement('sms', false)],
  offers: [offer('everywhere'), offer('web_only'), offer('switched_off'), offer('nothing'), offer('sms_only')],
  creatives: [
    creative('everywhere', 'web', true),
    creative('everywhere', 'email', true),
    creative('web_only', 'web', true),
    creative('switched_off', 'email', false),
    creative('sms_only', 'sms', true),
  ],
};

const screenUnderTest = () =>
  render(
    <StaticFormatProvider settings={SETTINGS}>
      <CreativeCoverage {...props} />
    </StaticFormatProvider>
  );

const rail = () => screen.getByRole('navigation', { name: 'Coverage, by stage' });
const evidence = () => screen.getByRole('region', { name: 'Evidence' });
const stageButton = (label: string) => within(rail()).getByRole('button', { name: new RegExp(`^${label}: `) });

describe('the coverage Cascade', () => {
  it('draws the four stages as the rail, nesting', () => {
    screenUnderTest();
    const names = within(rail())
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? '');
    expect(names.map((n) => n.split(':')[0])).toEqual([
      'Active offers',
      'Written for a channel that delivers',
      'Switched on',
      'Every delivering channel',
    ]);
    expect(names.map((n) => Number(n.split(': ')[1].split(',')[0]))).toEqual([5, 3, 2, 1]);
  });

  it('quotes the break for the whole on first paint', () => {
    screenUnderTest();
    expect(within(evidence()).getByText('Where it breaks')).toBeTruthy();
    expect(within(evidence()).getByText(/^3 active offers have nothing live on any channel that delivers/)).toBeTruthy();
  });

  it('at a stage, quotes what falls out in the legend’s own words, and counts exactly those offers', () => {
    screenUnderTest();
    fireEvent.click(stageButton('Written for a channel that delivers'));
    expect(within(evidence()).getByText('What falls out here')).toBeTruthy();
    expect(within(evidence()).getByText(`On every channel that delivers, ${CELL.none.means}.`)).toBeTruthy();
    // nothing and sms_only fell out here, of five active.
    expect(screen.getByText('2 of 5 active offers')).toBeTruthy();
  });

  it('at the break, says why it breaks rather than what fell out', () => {
    screenUnderTest();
    fireEvent.click(stageButton('Switched on'));
    expect(within(evidence()).getByText('Why it breaks here')).toBeTruthy();
    expect(within(evidence()).queryByText('What falls out here')).toBeNull();
    expect(screen.getByText('1 of 5 active offers')).toBeTruthy();
  });
});
