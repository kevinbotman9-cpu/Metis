import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

/**
 * A decision nobody owns is not pending. It is abandoned.
 *
 * On 2026-09-09 this repository had nine ADRs and four of them had been
 * Proposed since 2026-09-06 or 2026-09-07, each blocking scheduled work:
 * ADR-004 gated W-006 and W-008, ADR-005 gated every string in the console and
 * grew every sprint, ADR-007 gated W-017 and every authenticated integration,
 * and ADR-006 gated the descriptor registry — which was built anyway, three
 * days before it was accepted. ADR-006 records what that cost.
 *
 * None of the four named a person. Each ended by saying it needed a decision
 * from "product", or "product and legal", or "product and design review", and
 * nothing anywhere tracked whether that decision was being sought. The only way
 * to learn that a third of the platform's architectural decisions were parked
 * was to open nine files and read the third line of each.
 *
 * So: an ADR may sit Proposed. It may not sit Proposed *and* unowned for more
 * than thirty days. The threshold is generous on purpose — a fortnight of
 * genuine deliberation should not fail a build — and the rule is deliberately
 * about the owner rather than the elapsed time, because the failure being
 * caught is nobody chasing it, not slowness.
 *
 * **This is the weak version of the rule.** The strong version is that no
 * implementation may reference a Proposed ADR's subject, and it would have
 * caught ADR-006 on day three where this would not have caught it at all.
 * Nothing in this repository can check that, and pretending otherwise by
 * loosening this one until it appeared to cover the case would be worse than
 * stating the limit. See `docs/adr/ADR-006-configuration-schemas.md`.
 */

const ADR_DIR = resolve(__dirname, '../docs/adr');
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

interface Adr {
  file: string;
  status: string;
  /** The proposed date, which is what the age is measured from. */
  date: Date | null;
  owner: string | null;
  needBy: string | null;
}

/** `**Field:** value` on one line. */
function field(source: string, name: string): string | null {
  const m = source.match(new RegExp(`^\\*\\*${name}:\\*\\*\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

/** A value that is present but says nothing. */
function isEmpty(value: string | null): boolean {
  if (!value) return true;
  const v = value.replace(/[—–-]/g, '').trim().toLowerCase();
  return v === '' || v === 'tbd' || v === 'none' || v === 'n/a' || v === 'the team';
}

export function readAdrs(dir = ADR_DIR): Adr[] {
  return readdirSync(dir)
    .filter((f) => /^ADR-\d+.*\.md$/.test(f))
    .map((file) => {
      const source = readFileSync(join(dir, file), 'utf8');
      const raw = field(source, 'Date');
      // `2026-09-06 (proposed)` and `2026-09-06` both parse from the first ten.
      const iso = raw?.slice(0, 10) ?? '';
      const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : null;
      return {
        file,
        status: field(source, 'Status') ?? '',
        date,
        owner: field(source, 'Owner'),
        needBy: field(source, 'Decision needed by'),
      };
    });
}

const isProposed = (a: Adr) => /^proposed\b/i.test(a.status);

describe('an ADR that is Proposed has somebody chasing it', () => {
  const adrs = readAdrs();

  it('finds the decisions it is checking', () => {
    // Without this the assertions below pass by scanning nothing, which is the
    // shape of failure `tests/vocabulary.test.ts` and `docs-status.test.ts`
    // each already carry a guard against.
    expect(adrs.length, 'no ADRs found; has docs/adr moved?').toBeGreaterThan(5);
    expect(adrs.map((a) => a.file)).toContain('ADR-001-two-plane-architecture.md');
  });

  it('states a status and a date it can be read from', () => {
    const malformed = adrs
      .filter((a) => !a.status || !a.date)
      .map((a) => `${a.file}: status=${a.status || '(none)'} date=${a.date ? 'ok' : '(unparsable)'}`);
    expect(malformed, 'an ADR whose header cannot be read is invisible to this check').toEqual([]);
  });

  it('has no ADR Proposed for more than thirty days without an owner', () => {
    const now = Date.now();
    const stale = adrs
      .filter(isProposed)
      .filter((a) => a.date !== null && now - a.date.getTime() > THIRTY_DAYS_MS)
      .filter((a) => isEmpty(a.owner))
      .map((a) => {
        const days = Math.floor((now - a.date!.getTime()) / (24 * 60 * 60 * 1000));
        return `${a.file}: Proposed ${days} days, no owner`;
      });

    expect(
      stale,
      'name an owner in the header, or decide it — see docs/adr/TEMPLATE.md'
    ).toEqual([]);
  });

  it('gives every Proposed ADR an owner and a date the decision is needed by', () => {
    // The template requires both from the moment one is written. This is the
    // check that keeps a new ADR from starting the thirty-day clock unowned;
    // the one above is what catches the ones that already had.
    const incomplete = adrs
      .filter(isProposed)
      .filter((a) => isEmpty(a.owner) || isEmpty(a.needBy))
      .map((a) => `${a.file}: owner=${a.owner ?? '(missing)'} needBy=${a.needBy ?? '(missing)'}`);
    expect(incomplete, 'see docs/adr/TEMPLATE.md').toEqual([]);
  });

  it('does not count an accepted ADR as pending, however old', () => {
    // ADR-001 is from 2026-09-03 and Accepted. A check that flagged it would be
    // measuring age rather than the thing that matters.
    const accepted = adrs.filter((a) => /^accepted\b/i.test(a.status));
    expect(accepted.length).toBeGreaterThan(0);
    expect(accepted.filter(isProposed)).toEqual([]);
  });
});
