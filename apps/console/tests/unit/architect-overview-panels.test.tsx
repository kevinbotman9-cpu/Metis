// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { ProposedPanel, SimulatedPanel } from '@/components/architect-overview';
import { StaticFormatProvider } from '@/components/tenant-format';
import type { ChangeSetDto } from '@/lib/api-client';

/**
 * Two panels of the architect's Overview, as a first-time viewer reads them.
 *
 * The Proposed panel said "2 waiting for someone with approve:changes": a
 * permission identifier where a sentence belongs. The Simulated panel showed a
 * bias ratio of 1.38 marked failed with nothing to fail against, so the number
 * read as arbitrary. Both found walking Friday's path, 2026-09-15.
 */

afterEach(cleanup);

const sim = (passed: boolean, biasRatio: number) => ({
  ran: true,
  passed,
  populationSize: 1000,
  biasRatio,
  projectedMarginDelta: '',
  notes: '',
});

const CHANGE_SETS = [
  { id: 'cr_0042', title: 'Relax the threshold', status: 'pending', requestedBy: 'agent-strategist-01', simulation: sim(true, 1.04) },
  { id: 'cr_0041', title: 'Lower the context weight', status: 'pending', requestedBy: 'agent-strategist-01', simulation: sim(true, 1.01) },
  { id: 'cr_0039', title: 'Offer the gaming bundle', status: 'rejected', requestedBy: 'agent-strategist-01', simulation: sim(false, 1.38) },
] as unknown as ChangeSetDto[];

const withFormat = (ui: React.ReactNode) =>
  render(<StaticFormatProvider settings={{ locale: 'en-US', currency: 'USD' }}>{ui}</StaticFormatProvider>);

const row = (title: string) => screen.getByRole('link', { name: title }).closest('tr')!;

describe('the Proposed panel', () => {
  it('says who can approve in words, not as a permission identifier', () => {
    withFormat(<ProposedPanel changeSets={CHANGE_SETS} />);
    expect(screen.getByText('2 waiting for someone who can approve changes.')).toBeTruthy();
    expect(screen.queryByText(/approve:changes/)).toBeNull();
  });
});

describe('the Simulated panel', () => {
  it('reads each bias ratio against the limit that applies to it', () => {
    withFormat(<SimulatedPanel changeSets={CHANGE_SETS} gateFor={() => 1.2} />);
    const failed = within(row('Offer the gaming bundle'));
    expect(failed.getByText('1.38', { exact: false })).toBeTruthy();
    expect(failed.getByText('limit 1.20')).toBeTruthy();
  });

  it('says so when no limit resolves, rather than leaving the ratio bare', () => {
    withFormat(<SimulatedPanel changeSets={CHANGE_SETS} gateFor={(cr) => (cr.id === 'cr_0041' ? null : 1.2)} />);
    expect(within(row('Lower the context weight')).getByText('no limit resolves')).toBeTruthy();
    expect(within(row('Relax the threshold')).getByText('limit 1.20')).toBeTruthy();
  });

  it('shows the ratio alone while the limits are still loading', () => {
    withFormat(<SimulatedPanel changeSets={CHANGE_SETS} />);
    expect(screen.queryByText(/limit/)).toBeNull();
    expect(within(row('Offer the gaming bundle')).getByText('1.38', { exact: false })).toBeTruthy();
  });
});
