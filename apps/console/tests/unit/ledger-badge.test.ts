import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ledgerBadge as badge } from '@/lib/ledger-badge';
import { formatterFor } from '@/lib/format';

const format = formatterFor({ locale: 'en-US', currency: 'USD' });
const ledgerBadge = (s: Parameters<typeof badge>[0], failed: boolean) => badge(s, failed, format);

/**
 * The chrome said "Fixture data" whatever the ledger held, including a
 * PostgreSQL ledger in which every decision was made through the storefront
 * (2026-09-18). It says what the ledger holds now.
 */
describe('what the chrome says the screens are showing', () => {
  it('names a ledger made by using the demo as that, and says where it is kept', () => {
    expect(ledgerBadge({ store: 'postgres', decisions: 286, seeded: 0, madeByHand: 286 }, false)).toBe(
      'PostgreSQL · 286 decisions made by using the demo'
    );
  });

  it('names the seeded history as seeded, and a mix as both', () => {
    expect(ledgerBadge({ store: 'memory', decisions: 10400, seeded: 10400, madeByHand: 0 }, false)).toBe(
      'In memory · seeded history, 10,400 decisions'
    );
    expect(ledgerBadge({ store: 'memory', decisions: 10401, seeded: 10400, madeByHand: 1 }, false)).toBe(
      'In memory · seeded history and 1 decision made by using the demo'
    );
  });

  it('says an empty ledger is empty, and never claims to know when it could not read', () => {
    expect(ledgerBadge({ store: 'postgres', decisions: 0, seeded: 0, madeByHand: 0 }, false)).toBe(
      'PostgreSQL · no decisions yet'
    );
    expect(ledgerBadge(undefined, true)).toBe('Ledger could not be read');
  });

  it('is what the chrome shows, not a constant beside it', () => {
    const shell = readFileSync(path.resolve(__dirname, '../../components/app-shell.tsx'), 'utf8');
    expect(shell).not.toContain('Fixture data');
    expect(shell).toContain('{ledgerBadge(ledgerSummary.data, ledgerSummary.isError, format)}');
  });
});
