'use client';

import { useState, useRef, useMemo, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

/**
 * One search box instead of a field per parameter.
 *
 * A row of labelled inputs makes the caller guess which box a value belongs in
 * and takes a whole band of vertical space before any data appears. Here the
 * user types, picks a facet, and the choice becomes a chip they can dismiss.
 *
 * Typing `cust_88` and pressing Enter searches free text. Typing `channel:` (or
 * picking from the suggestions) constrains a facet.
 */

export interface Facet {
  /** Machine key, e.g. "channel". */
  key: string;
  /** What a person calls it, e.g. "Channel". */
  label: string;
  /** Fixed set of values; omit for free text. */
  options?: { value: string; label: string }[];
  /** Shown in the suggestion list. */
  hint?: string;
}

export interface FilterChip {
  facet: string;
  value: string;
}

interface SmartSearchProps {
  facets: Facet[];
  chips: FilterChip[];
  onChange: (chips: FilterChip[]) => void;
  placeholder?: string;
}

export function SmartSearch({ facets, chips, onChange, placeholder }: SmartSearchProps) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const byKey = useMemo(() => new Map(facets.map((f) => [f.key, f])), [facets]);

  /** `channel:web` splits into a facet and a value; anything else is free text. */
  const [typedFacet, typedValue] = useMemo(() => {
    const at = draft.indexOf(':');
    if (at === -1) return [null, draft] as const;
    const key = draft.slice(0, at).trim().toLowerCase();
    return byKey.has(key) ? ([key, draft.slice(at + 1).trim()] as const) : ([null, draft] as const);
  }, [draft, byKey]);

  /** What pressing Enter would add, and what the dropdown offers. */
  const suggestions = useMemo(() => {
    if (typedFacet) {
      const facet = byKey.get(typedFacet)!;
      const options = facet.options ?? [];
      const matching = options.filter(
        (o) =>
          !typedValue ||
          o.label.toLowerCase().includes(typedValue.toLowerCase()) ||
          o.value.toLowerCase().includes(typedValue.toLowerCase())
      );
      if (options.length === 0 && typedValue) {
        return [{ facet: facet.key, value: typedValue, label: `${facet.label}: ${typedValue}` }];
      }
      return matching.map((o) => ({
        facet: facet.key,
        value: o.value,
        label: `${facet.label}: ${o.label}`,
      }));
    }

    const term = draft.trim();
    if (!term) {
      return facets.map((f) => ({
        facet: f.key,
        value: '',
        label: `${f.label}${f.hint ? ` — ${f.hint}` : ''}`,
      }));
    }

    // Free text plus any facet whose name the term prefixes.
    const facetMatches = facets
      .filter((f) => f.label.toLowerCase().startsWith(term.toLowerCase()))
      .map((f) => ({ facet: f.key, value: '', label: `${f.label}: …` }));

    const free = facets.find((f) => !f.options);
    return [
      ...(free ? [{ facet: free.key, value: term, label: `${free.label} contains “${term}”` }] : []),
      ...facetMatches,
    ];
  }, [draft, typedFacet, typedValue, facets, byKey]);

  function add(chip: { facet: string; value: string }) {
    if (!chip.value) {
      // Selecting a facet with no value just primes the input for it.
      setDraft(`${chip.facet}:`);
      inputRef.current?.focus();
      return;
    }
    // One value per facet: a second choice replaces the first rather than
    // silently ANDing two values that can never both be true.
    onChange([...chips.filter((c) => c.facet !== chip.facet), { facet: chip.facet, value: chip.value }]);
    setDraft('');
    setOpen(false);
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = suggestions.find((s) => s.value);
      if (first) add(first);
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    // Backspace on an empty box removes the last chip, as in every other
    // token input people have used.
    if (e.key === 'Backspace' && draft === '' && chips.length > 0) {
      onChange(chips.slice(0, -1));
    }
  }

  function labelFor(chip: FilterChip) {
    const facet = byKey.get(chip.facet);
    const option = facet?.options?.find((o) => o.value === chip.value);
    return `${facet?.label ?? chip.facet}: ${option?.label ?? chip.value}`;
  }

  return (
    <div className="relative">
      <div
        className={cn(
          'flex flex-wrap items-center gap-1.5 rounded border border-border bg-surface px-2 py-1.5',
          'focus-within:border-accent focus-within:outline-2 focus-within:outline-accent'
        )}
        onClick={() => inputRef.current?.focus()}
      >
        <span aria-hidden className="text-content-subtle">
          ⌕
        </span>

        {chips.map((chip) => (
          <span
            key={`${chip.facet}:${chip.value}`}
            className="inline-flex items-center gap-1 rounded-sm bg-accent-subtle px-1.5 py-0.5 text-label font-medium text-accent"
          >
            {labelFor(chip)}
            <button
              type="button"
              aria-label={`Remove filter ${labelFor(chip)}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(chips.filter((c) => c !== chip));
              }}
              className="rounded-sm px-0.5 leading-none hover:bg-accent hover:text-on-accent"
            >
              ×
            </button>
          </span>
        ))}

        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKey}
          placeholder={chips.length === 0 ? (placeholder ?? 'Search, or type a filter') : ''}
          aria-label="Search and filter"
          aria-expanded={open}
          role="combobox"
          aria-controls="smart-search-suggestions"
          className="min-w-[12rem] flex-1 bg-transparent text-body text-content outline-none placeholder:text-content-subtle"
        />

        {chips.length > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            className="ml-auto rounded px-1.5 py-0.5 text-label text-content-subtle hover:bg-surface-sunken hover:text-content"
          >
            Clear all
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul
          id="smart-search-suggestions"
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-surface-raised p-1 shadow-lg"
        >
          {suggestions.map((s) => (
            <li key={`${s.facet}:${s.value}:${s.label}`}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => add(s)}
                className="w-full rounded px-2 py-1.5 text-left text-body text-content hover:bg-surface-sunken"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Turn chips into the query object the client expects. */
export function chipsToQuery(chips: FilterChip[]): Record<string, string> {
  return Object.fromEntries(chips.map((c) => [c.facet, c.value]));
}
