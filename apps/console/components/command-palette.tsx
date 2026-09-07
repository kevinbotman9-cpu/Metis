'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/cn';

/**
 * Jump to anything, from anywhere.
 *
 * The console has five thousand decisions, a four-level offer taxonomy and
 * sixteen routes. Without this, reaching a specific offer means three
 * clicks and a scroll, and reaching a specific decision means knowing its id
 * and editing the URL. Cmd/Ctrl+K is where people already reach for this.
 */

type ResultKind = 'page' | 'offer' | 'flow' | 'decision' | 'action';

interface Result {
  kind: ResultKind;
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  /** Higher sorts first within a category. */
  weight?: number;
}

const KIND_LABEL: Record<ResultKind, string> = {
  action: 'Actions',
  page: 'Go to',
  offer: 'Offers',
  flow: 'Decision flows',
  decision: 'Decisions',
};

const KIND_ORDER: ResultKind[] = ['action', 'page', 'offer', 'flow', 'decision'];

const KIND_TONE: Record<ResultKind, string> = {
  action: 'text-hold',
  page: 'text-content-subtle',
  offer: 'text-accent',
  flow: 'text-pass',
  decision: 'text-info',
};

const PAGES: Result[] = [
  { kind: 'page', id: 'home', title: 'Home', href: '/' },
  { kind: 'page', id: 'offers', title: 'Offers', subtitle: 'Offer catalogue', href: '/offers' },
  { kind: 'page', id: 'datamodel', title: 'Data model', subtitle: 'Entities, fields and rollups', href: '/data-model' },
  { kind: 'page', id: 'intake', title: 'Intake', subtitle: 'Land, map, validate, activate', href: '/data-model/intake' },
  { kind: 'page', id: 'engagement', title: 'Targeting Policies', subtitle: 'Eligibility, relevance, suitability', href: '/targeting-policies' },
  { kind: 'page', id: 'contact', title: 'Frequency Policy', subtitle: 'Frequency caps and cooldowns', href: '/frequency-policy' },
  { kind: 'page', id: 'arbitration', title: 'Arbitration & Boosts', subtitle: 'P x V x L x C', href: '/arbitration' },
  { kind: 'page', id: 'flows', title: 'Decision flows', subtitle: 'Compiled decision graphs', href: '/decision-flows' },
  { kind: 'page', id: 'decisions', title: 'Decisions', subtitle: 'Search traces and replay', href: '/decisions' },
  { kind: 'page', id: 'simulations', title: 'Simulations', href: '/simulations' },
  { kind: 'page', id: 'approvals', title: 'Approvals', subtitle: 'Change set queue', href: '/approvals' },
  { kind: 'page', id: 'agentic', title: 'Agentic AI', subtitle: 'Autonomy levels and guardrails', href: '/agentic' },
  { kind: 'page', id: 'audit', title: 'Audit Log', href: '/audit' },
  { kind: 'page', id: 'creatives', title: 'Creatives', subtitle: 'Content library', href: '/creatives' },
  { kind: 'page', id: 'integrations', title: 'Integrations', subtitle: 'Connectors and outbound calls', href: '/integrations' },
  { kind: 'page', id: 'traffic', title: 'Inbound traffic', subtitle: 'Requests served, with full payloads', href: '/integrations/traffic' },
  { kind: 'page', id: 'settings', title: 'Settings', href: '/settings' },
];

/** Case-insensitive substring match, with a crude relevance score. */
function score(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const at = h.indexOf(n);
  if (at === -1) return 0;
  // Prefix matches beat mid-string ones; shorter fields beat longer.
  return (at === 0 ? 2 : 1) + 1 / (h.length + 1);
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Only fetch once the palette has actually been opened, so it costs nothing
  // on pages that never use it.
  const taxonomy = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => apiClient.getTaxonomy(),
    enabled: open,
  });
  const artifacts = useQuery({
    queryKey: ['artifacts'],
    queryFn: () => apiClient.listArtifacts(),
    enabled: open,
  });
  const decisions = useQuery({
    queryKey: ['decisions', 'palette'],
    queryFn: () => apiClient.searchDecisions({ limit: 5000 }),
    enabled: open && query.length >= 2,
  });

  const results = useMemo<Result[]>(() => {
    const q = query.trim();

    const pool: Result[] = [
      ...PAGES,
      ...(taxonomy.data?.offers ?? []).map((p) => ({
        kind: 'offer' as const,
        id: p.id,
        title: p.name,
        subtitle: `${p.key} · ${p.status}`,
        href: `/offers/${p.id}`,
      })),
      ...(artifacts.data?.artifacts ?? []).map((a) => ({
        kind: 'flow' as const,
        id: a.id,
        title: a.name,
        subtitle: `${a.id} · ${a.activeVersion}`,
        href: `/decision-flows/${a.id}`,
      })),
    ];

    if (!q) {
      // An empty palette is not empty: offer the places people go most.
      return pool.filter((r) => r.kind === 'page').slice(0, 8);
    }

    const decisionMatches = (decisions.data?.decisions ?? [])
      .filter((d) => score(d.id, q) > 0 || score(d.customerId, q) > 0)
      .slice(0, 6)
      .map((d) => ({
        kind: 'decision' as const,
        id: d.id,
        title: d.id,
        subtitle: `${d.customerId} · ${d.channel} · ${d.winner ?? 'no offer'}`,
        href: `/decisions/${d.id}`,
      }));

    const scored = pool
      .map((r) => ({
        r,
        s: Math.max(score(r.title, q), score(r.subtitle ?? '', q) * 0.6),
      }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.r);

    return [...scored, ...decisionMatches].slice(0, 24);
  }, [query, taxonomy.data, artifacts.data, decisions.data]);

  // Grouped for display, but navigation runs over the flat list so arrow keys
  // move through everything in one sequence.
  const grouped = useMemo(() => {
    const byKind = new Map<ResultKind, Result[]>();
    for (const r of results) {
      byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
    }
    return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({
      kind: k,
      items: byKind.get(k)!,
    }));
  }, [results]);

  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after paint, or the dialog steals it back.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = useCallback(
    (r: Result) => {
      onOpenChange(false);
      router.push(r.href);
    },
    [onOpenChange, router]
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (flat.length === 0 ? 0 : (i + 1) % flat.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (flat.length === 0 ? 0 : (i - 1 + flat.length) % flat.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = flat[active];
      if (target) go(target);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
    }
  }

  if (!open) return null;

  let index = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-scrim/55 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => onOpenChange(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <span aria-hidden className="text-content-subtle">
            ⌕
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded
            aria-controls="command-results"
            aria-activedescendant={flat[active] ? `cmd-${flat[active].id}` : undefined}
            aria-label="Search offers, decision flows, decisions and pages"
            placeholder="Search offers, decision flows, decisions…"
            className="w-full bg-transparent py-3 text-body text-content outline-none placeholder:text-content-subtle"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 font-mono text-[0.625rem] text-content-subtle">
            Esc
          </kbd>
        </div>

        <ul id="command-results" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {flat.length === 0 ? (
            <li className="px-3 py-8 text-center text-body text-content-muted">
              Nothing matches “{query}”.
            </li>
          ) : (
            grouped.map((category) => (
              <li key={category.kind}>
                <p className="px-2 pb-1 pt-2 text-[0.625rem] font-semibold uppercase tracking-[0.08em] text-content-subtle">
                  {KIND_LABEL[category.kind]}
                </p>
                <ul>
                  {category.items.map((r) => {
                    index += 1;
                    const isActive = index === active;
                    const myIndex = index;
                    return (
                      <li key={`${r.kind}-${r.id}`}>
                        <button
                          id={`cmd-${r.id}`}
                          role="option"
                          aria-selected={isActive}
                          data-active={isActive}
                          onMouseEnter={() => setActive(myIndex)}
                          onClick={() => go(r)}
                          className={cn(
                            'flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left',
                            isActive ? 'bg-accent/12' : 'hover:bg-surface-sunken'
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn('shrink-0 text-[0.625rem]', KIND_TONE[r.kind])}
                          >
                            ●
                          </span>
                          <span className="min-w-0 flex-1 truncate text-body text-content">
                            {r.title}
                          </span>
                          {r.subtitle ? (
                            <span className="shrink-0 truncate font-mono text-[0.6875rem] text-content-subtle">
                              {r.subtitle}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center gap-3 border-t border-border px-3 py-2 text-[0.625rem] text-content-subtle">
          <span>
            <kbd className="font-mono">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="font-mono">↵</kbd> open
          </span>
          {query.length === 1 && (
            <span className="ml-auto">Type two characters to search decisions</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Binds Cmd/Ctrl+K globally and returns the open state. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return { open, setOpen };
}
