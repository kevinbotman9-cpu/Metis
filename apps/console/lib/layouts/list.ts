import {
  getPath,
  toMajor,
  type EntityDescriptor,
  type FieldDescriptor,
  type ListColumn,
  type ListDetailManifest,
  type ListFacet,
  type Option,
} from '@metis/ui-metadata';
import type { Row } from './sources';
import type { Formatter } from '@/lib/format';

/**
 * What the list–detail renderer computes, kept out of the component so each
 * rule has a test: how a value reads, what a filter keeps, what a facet counts,
 * and where the selection moves.
 */

export interface Shown {
  text: string;
  /** Present when the value names a record that can be read elsewhere. */
  href?: string;
  /** Nothing is set. Rendered quietly, and never as a zero. */
  empty?: boolean;
}

const NOT_SET: Shown = { text: 'Not set', empty: true };

/**
 * A value as a person reads it: the descriptor's own words for it.
 *
 * `short` is for a list row or a facet, where "Nothing — decides, and nobody
 * sends it" does not fit and "Nothing" says the same. The overview passes
 * `false`, because that is where somebody is deciding and needs the sentence.
 */
export function display(
  field: FieldDescriptor | undefined,
  value: unknown,
  optionSources: Record<string, readonly Option[]>,
  format: Formatter,
  short = false
): Shown {
  if (!field) {
    if (value === undefined || value === null || value === '') return NOT_SET;
    return { text: String(value) };
  }
  if (field.type === 'boolean') {
    const on = Boolean(value);
    const labels = field.booleanLabels ?? { true: 'Yes', false: 'No' };
    return { text: on ? labels.true : labels.false };
  }
  if (field.type === 'select' && field.options) {
    const options = 'static' in field.options ? field.options.static : optionSources[field.options.source] ?? [];
    const match = options.find((o) => o.value === String(value ?? ''));
    if (match) return { text: (short && match.short) || match.label, href: match.href };
  }
  if (value === undefined || value === null || value === '') return NOT_SET;
  switch (field.type) {
    case 'money': {
      const amount = Number(getPath(value, 'amount') ?? 0);
      const currency = getPath(value, 'currency');
      return { text: `${toMajor(amount)}${currency ? ` ${String(currency)}` : ''}` };
    }
    case 'tags':
      return Array.isArray(value) && value.length ? { text: value.join(', ') } : NOT_SET;
    case 'date':
      return { text: format.date(String(value), { day: '2-digit', month: 'short', year: 'numeric' }) };
    default:
      return { text: String(value) };
  }
}

export interface Column {
  field: string;
  label: string;
  descriptor?: FieldDescriptor;
  unit?: readonly [string, string];
}

/** A manifest's columns, labelled from the descriptor unless the manifest labels them itself. */
export function columnsOf(manifest: ListDetailManifest, descriptor: EntityDescriptor): Column[] {
  return columnsFrom(manifest.params.list.columns, descriptor);
}

/** Any list of columns over an entity — a manifest's, or a panel's over its own entity. */
export function columnsFrom(columns: readonly ListColumn[], descriptor: EntityDescriptor): Column[] {
  const byField = new Map(descriptor.fields.map((f) => [f.field, f]));
  return columns.map((c: ListColumn) => {
    const field = typeof c === 'string' ? c : c.field;
    const own = byField.get(field);
    return {
      field,
      label: (typeof c === 'string' ? undefined : c.label) ?? own?.label ?? field,
      descriptor: own,
      unit: typeof c === 'string' ? undefined : c.unit,
    };
  });
}

/** A column's value on one row, as the row shows it. "1 offer", not "1". */
export function cell(row: Row, column: Column, optionSources: Record<string, readonly Option[]>, format: Formatter): Shown {
  const value = getPath(row, column.field);
  if (column.unit && typeof value === 'number') {
    return { text: `${value} ${value === 1 ? column.unit[0] : column.unit[1]}` };
  }
  return display(column.descriptor, value, optionSources, format, true);
}

// --- filtering -------------------------------------------------------------

export interface ListFilter {
  query: string;
  /** Facet field → the one value kept. Absent means every value. */
  facets: Readonly<Record<string, string>>;
}

export const NO_FILTER: ListFilter = { query: '', facets: {} };

/**
 * A facet, resolved: a descriptor field with a closed set of values, or a value
 * the source derives, which the manifest labels and enumerates itself.
 */
export interface Facet {
  field: string;
  label: string;
  /** Present for a descriptor field. */
  descriptor?: FieldDescriptor;
  /** Present for a derived value: its values, in the manifest's words. */
  options?: readonly { value: string; label: string }[];
}

/** The manifest's facets, labelled by the descriptor or by the manifest. */
export function facetsOf(manifest: ListDetailManifest, descriptor: EntityDescriptor): Facet[] {
  const byField = new Map(descriptor.fields.map((f) => [f.field, f]));
  return manifest.params.list.facets.flatMap((f: ListFacet): Facet[] => {
    if (typeof f !== 'string') return [{ field: f.field, label: f.label, options: f.options }];
    const own = byField.get(f);
    return own ? [{ field: f, label: own.label, descriptor: own }] : [];
  });
}

const asFacet = (f: Facet | FieldDescriptor): Facet =>
  'type' in f ? { field: f.field, label: f.label, descriptor: f } : f;

/** The string a facet compares: `true` or `false` for a boolean, the value itself otherwise. */
export function facetValue(row: Row, facet: Facet | FieldDescriptor): string {
  const f = asFacet(facet);
  const value = getPath(row, f.field);
  if (f.descriptor?.type === 'boolean' || typeof value === 'boolean') return value ? 'true' : 'false';
  return value === undefined || value === null ? '' : String(value);
}

/**
 * A facet's values, in the descriptor's order and words, or the manifest's for
 * a derived one. A field whose options come from a named source offers what
 * that source holds, so a tenant's categories are values to filter by without
 * anybody listing them.
 */
export function facetOptions(
  facet: Facet | FieldDescriptor,
  optionSources: Readonly<Record<string, readonly Option[]>> = {}
): { value: string; label: string }[] {
  const f = asFacet(facet);
  if (f.options) return [...f.options];
  const field = f.descriptor;
  if (!field) return [];
  if (field.type === 'boolean') {
    const labels = field.booleanLabels ?? { true: 'Yes', false: 'No' };
    return [
      { value: 'true', label: labels.true },
      { value: 'false', label: labels.false },
    ];
  }
  if (field.options && 'static' in field.options) {
    return field.options.static.map((o) => ({ value: o.value, label: o.short ?? o.label }));
  }
  if (field.options) {
    return (optionSources[field.options.source] ?? []).map((o) => ({ value: o.value, label: o.short ?? o.label }));
  }
  return [];
}

/** What a typed filter is matched against: the row's title, subtitle and every column as shown. */
function haystack(
  row: Row,
  manifest: ListDetailManifest,
  columns: Column[],
  optionSources: Record<string, readonly Option[]>,
  format: Formatter
): string {
  const { title, subtitle } = manifest.params.list;
  return [getPath(row, title), subtitle ? getPath(row, subtitle) : '', ...columns.map((c) => cell(row, c, optionSources, format).text)]
    .map((v) => String(v ?? ''))
    .join(' ')
    .toLowerCase();
}

export interface Filtered {
  rows: Row[];
  /** Facet field → value → how many rows it would keep, given everything else chosen. */
  counts: Record<string, Record<string, number>>;
}

/**
 * The rows a filter keeps, and the count beside each facet value.
 *
 * A facet's counts honour the query and every *other* facet, never its own —
 * otherwise choosing "SMS" would show every other channel at zero, and the
 * counts would say only what was already chosen.
 */
export function applyFilter(
  rows: readonly Row[],
  filter: ListFilter,
  manifest: ListDetailManifest,
  descriptor: EntityDescriptor,
  optionSources: Record<string, readonly Option[]>,
  format: Formatter
): Filtered {
  const columns = columnsOf(manifest, descriptor);
  const facets = facetsOf(manifest, descriptor);
  const query = filter.query.trim().toLowerCase();
  const byQuery = query ? rows.filter((r) => haystack(r, manifest, columns, optionSources, format).includes(query)) : [...rows];

  const keeps = (row: Row, except?: string) =>
    facets.every((f) => f.field === except || filter.facets[f.field] === undefined || facetValue(row, f) === filter.facets[f.field]);

  const counts: Record<string, Record<string, number>> = {};
  for (const f of facets) {
    const tally: Record<string, number> = {};
    for (const o of facetOptions(f, optionSources)) tally[o.value] = 0;
    for (const row of byQuery) if (keeps(row, f.field)) tally[facetValue(row, f)] = (tally[facetValue(row, f)] ?? 0) + 1;
    counts[f.field] = tally;
  }
  return { rows: sortRows(byQuery.filter((r) => keeps(r)), manifest), counts };
}

/** The manifest's order: numbers as numbers, everything else as text. */
export function sortRows(rows: readonly Row[], manifest: ListDetailManifest): Row[] {
  const sort = manifest.params.list.sort;
  if (!sort) return [...rows];
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = getPath(a, sort.field);
    const bv = getPath(b, sort.field);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
  });
}

// --- selection ---------------------------------------------------------------

/**
 * Where `j`/`k`, the arrows, Home and End take the selection. Stops at either
 * end rather than wrapping: a list that wraps hides where it ends.
 */
export function step(ids: readonly string[], current: string | null, move: 1 | -1 | 'first' | 'last'): string | null {
  if (ids.length === 0) return null;
  if (move === 'first') return ids[0];
  if (move === 'last') return ids[ids.length - 1];
  const at = current === null ? -1 : ids.indexOf(current);
  if (at === -1) return ids[0];
  return ids[Math.min(ids.length - 1, Math.max(0, at + move))];
}

/** The open record: the one the URL names if it is still in view, else the first. */
export function openRow(rows: readonly Row[], identity: (r: Row) => string, selected: string | null): Row | null {
  return rows.find((r) => identity(r) === selected) ?? rows[0] ?? null;
}

/**
 * Whether the URL names a record the list does not hold at all: a stale link,
 * or a record deleted since. Not the same as one a filter is holding back —
 * that one exists, and the first row in view opens instead. The caller asks
 * only of a settled list, because one refetching after a write has not caught
 * up with the record it just made.
 */
export function selectionMissing(rows: readonly Row[], identity: (r: Row) => string, selected: string | null): boolean {
  return selected !== null && !rows.some((r) => identity(r) === selected);
}

/** "5 placements", or "2 of 5 placements" once a filter is holding some back. */
export function countLabel(shown: number, total: number, noun: { singular: string; plural: string }): string {
  const word = total === 1 ? noun.singular : noun.plural;
  return shown === total ? `${total} ${word}` : `${shown} of ${total} ${word}`;
}
