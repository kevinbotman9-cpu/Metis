// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { FlowsPanel, ProposedPanel, SimulatedPanel } from '@/components/architect-overview';
import { StaticFormatProvider } from '@/components/tenant-format';
import type { ArtifactSummaryDto, ChangeSetDto } from '@/lib/api-client';

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

/** The lead line's text, figures and labels together, as a reader takes it in. */
const lead = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-lead]')).map((p) => p.textContent?.replace(/\s+/g, ' ').trim());

/** A figure is set as a figure, not as body text. */
const isFigure = (el: HTMLElement) => el.className.includes('text-figure') && el.className.includes('font-semibold');

describe('the Proposed panel', () => {
  it('leads with a figure and says who can approve in words, not as a permission identifier', () => {
    const { container } = withFormat(<ProposedPanel changeSets={CHANGE_SETS} />);
    expect(lead(container)).toEqual(['2 waiting']);
    expect(isFigure(screen.getByText('2', { exact: true }))).toBe(true);
    expect(screen.getByText('for someone who can approve changes')).toBeTruthy();
    expect(screen.queryByText(/approve:changes/)).toBeNull();
  });
});

describe('the Flows panel', () => {
  it('leads with two figures, live and draft, rather than a sentence', () => {
    const artifacts = [
      { id: 'a', name: 'A', status: 'active', activeVersion: '1.0.0', compileOk: true },
      { id: 'b', name: 'B', status: 'draft', activeVersion: '0.1.0', compileOk: false, errorCount: 1 },
    ] as unknown as ArtifactSummaryDto[];
    const { container } = withFormat(<FlowsPanel artifacts={artifacts} />);
    expect(lead(container)).toEqual(['1 live 1 draft']);
    expect(screen.getByText('1 will not compile, so cannot be promoted')).toBeTruthy();
  });
});

describe('the Simulated panel', () => {
  it('leads with how many passed, as a figure', () => {
    const { container } = withFormat(<SimulatedPanel changeSets={CHANGE_SETS} />);
    expect(lead(container)).toEqual(['2 of 3 passed']);
    expect(screen.getByText('1 failed, and its change was not shipped')).toBeTruthy();
  });

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
