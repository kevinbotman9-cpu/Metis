// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { DataTable, type Column } from '@/components/ui/data-table';
import { StaticFormatProvider } from '@/components/tenant-format';

/**
 * An empty table is still a table.
 *
 * *Data can be zero; structure cannot vanish* — the product owner's rule, from
 * 2026-09-17. Until then `DataTable` returned an `EmptyState` in place of itself
 * when it had no rows, so the column headers a reader was about to fill were
 * replaced by a sentence. That was every list screen in the console: decisions,
 * a loop stage, arbitration, audit, creatives, decision flows, frequency policy,
 * integrations, the policies list and creative coverage.
 *
 * Asserted on the one shared component rather than on ten screens, because the
 * behaviour lives here and a screen cannot opt out of it any more.
 */

type Row = { id: string; name: string; count: number };

const COLUMNS: Column<Row>[] = [
  { key: 'name', header: 'Name', sortValue: (r) => r.name, cell: (r) => r.name },
  { key: 'count', header: 'Count', align: 'right', sortValue: (r) => r.count, cell: (r) => r.count },
];

afterEach(cleanup);

/** A table formats counts in the tenant's locale, so it renders inside one. */
const renderInTenant = (ui: ReactElement) =>
  render(<StaticFormatProvider settings={{ locale: 'en-US', currency: 'USD' }}>{ui}</StaticFormatProvider>);

describe('an empty table keeps its structure', () => {
  it('keeps every column header when there are no rows', () => {
    renderInTenant(<DataTable columns={COLUMNS} rows={[]} rowKey={(r) => r.id} caption="Things" emptyTitle="No things yet" />);

    const table = screen.getByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[⇅▲▼]/g, '').trim());
    expect(headers).toEqual(['Name', 'Count']);
  });

  it('says why it is empty inside the table, across every column', () => {
    renderInTenant(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        rowKey={(r) => r.id}
        emptyTitle="No things yet"
        emptyDescription="Add one and it appears here."
      />
    );

    const table = screen.getByRole('table');
    expect(within(table).getByText('No things yet')).toBeTruthy();
    expect(within(table).getByText('Add one and it appears here.')).toBeTruthy();

    // One body row, spanning the columns, and no data rows pretending to exist.
    const cell = within(table).getByText('No things yet').closest('td');
    expect(cell?.getAttribute('colspan')).toBe(String(COLUMNS.length));
    expect(table.querySelectorAll('tr[data-row]')).toHaveLength(0);
  });

  it('renders rows as before when there are some', () => {
    renderInTenant(
      <DataTable
        columns={COLUMNS}
        rows={[{ id: 'a', name: 'Alpha', count: 1 }]}
        rowKey={(r) => r.id}
        emptyTitle="No things yet"
      />
    );
    const table = screen.getByRole('table');
    expect(table.querySelectorAll('tr[data-row]')).toHaveLength(1);
    expect(within(table).queryByText('No things yet')).toBeNull();
  });
});
