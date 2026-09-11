'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { getPath, type EntityDescriptor, type ListDetailManifest, type Occupant } from '@metis/ui-metadata';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageBody,
  PageHeader,
  Select,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import {
  applyFilter,
  cell,
  columnsOf,
  countLabel,
  facetOptions,
  openRow,
  step,
  type ListFilter,
} from '@/lib/layouts/list';
import type { Row } from '@/lib/layouts/sources';
import { cn } from '@/lib/cn';
import { panelFor } from './panels';
import type { PanelContext, SourceState } from './panel';

/**
 * The list–detail pattern. `docs/METIS_CONSOLE_SPEC.md` §4.1; ADR-015.
 *
 * Written once. Every screen on this pattern gets the same split canvas, the
 * same keyboard path and the same five states, and a screen's manifest decides
 * only what fills them — so improving list–detail is a change here, and ten
 * screens inherit it, instead of ten changes drifting apart from the first.
 *
 * It holds no data and no router. The host (`screen.tsx`) resolves the
 * manifest's sources and keeps selection, tab and filter in the URL; this draws
 * what it is given and says what the person did. That is also why every state
 * has a story with no network behind it.
 *
 * - **No page navigation between list and detail.** Selecting a row fills the
 *   right pane.
 * - **Keyboard:** `j`/`k` or the arrows move the selection, Home and End go to
 *   either end, `/` focuses the filter from anywhere on the screen, `Enter`
 *   moves into the detail, `Esc` returns to the list.
 * - **List pane** 20rem wide, resizable, and it remembers the width per screen.
 * - **Faceted filters with counts**, from the descriptor's closed sets.
 * - **Detail tabs** with the open tab in the URL; the footer strip shows the
 *   version, state, last edit and author the record has.
 */

export interface ListDetailProps {
  manifest: ListDetailManifest;
  descriptor: EntityDescriptor;
  identity: (row: Row) => string;
  /** The list's source, resolved. */
  list: SourceState;
  error?: string;
  onRetry?: () => void;
  selected: string | null;
  onSelect: (id: string) => void;
  tab: string | null;
  onTab: (id: string) => void;
  filter: ListFilter;
  onFilter: (filter: ListFilter) => void;
  /** Present only when the session may create one. */
  onCreate?: () => void;
  /** Present only when the session may edit one. */
  onEdit?: (row: Row) => void;
  context: PanelContext;
}

const WIDTH = { initial: 320, min: 256, max: 560, step: 16 } as const;
const VIRTUALISE_ABOVE = 80;
const OVERSCAN = 8;
const VIEWPORT = 560;

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A DOM id from a record identity, which may hold anything. */
const domId = (prefix: string, id: string) => `${prefix}-${id.replace(/[^A-Za-z0-9_-]/g, '_')}`;

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** The list pane's width, remembered per screen. Read after mount, so the server render matches. */
function useListWidth(key: string) {
  const [width, setWidth] = useState<number>(WIDTH.initial);
  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem(key));
      if (stored >= WIDTH.min && stored <= WIDTH.max) setWidth(stored);
    } catch {
      // Storage refused (private mode, a policy): the default is still a width.
    }
  }, [key]);
  const set = useCallback(
    (next: number) => {
      const clamped = Math.round(Math.min(WIDTH.max, Math.max(WIDTH.min, next)));
      setWidth(clamped);
      try {
        window.localStorage.setItem(key, String(clamped));
      } catch {
        // As above: an unremembered width is not an error.
      }
    },
    [key]
  );
  return [width, set] as const;
}

export function ListDetail({
  manifest,
  descriptor,
  identity,
  list,
  error,
  onRetry,
  selected,
  onSelect,
  tab,
  onTab,
  filter,
  onFilter,
  onCreate,
  onEdit,
  context,
}: ListDetailProps) {
  const base = useId().replace(/:/g, '');
  const { noun } = descriptor;
  const columns = useMemo(() => columnsOf(manifest, descriptor), [manifest, descriptor]);
  const facets = useMemo(
    () => manifest.params.list.facets.flatMap((f) => descriptor.fields.find((d) => d.field === f) ?? []),
    [manifest, descriptor]
  );
  const filtered = useMemo(
    () => applyFilter(list.rows, filter, manifest, descriptor, context.optionSources),
    [list.rows, filter, manifest, descriptor, context.optionSources]
  );
  const ids = useMemo(() => filtered.rows.map(identity), [filtered.rows, identity]);
  const open = openRow(filtered.rows, identity, selected);
  const openId = open ? identity(open) : null;

  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [width, setWidth] = useListWidth(`metis.layout.${manifest.id}.list-width`);

  // `/` focuses the filter from anywhere on the screen — except while typing,
  // or while a dialog is open over it.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      filterRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // --- virtualisation, as DataTable does it: measure a row, render a window.
  const virtualise = filtered.rows.length > VIRTUALISE_ABOVE;
  const [scrollTop, setScrollTop] = useState(0);
  const [rowHeight, setRowHeight] = useState(0);
  useEffect(() => {
    if (!virtualise) return;
    const first = listRef.current?.querySelector('[role="option"]');
    if (first instanceof HTMLElement && first.offsetHeight > 0) {
      setRowHeight((h) => (h === first.offsetHeight ? h : first.offsetHeight));
    }
  }, [virtualise, filtered.rows]);
  const h = rowHeight || 56;
  const start = virtualise ? Math.max(0, Math.floor(scrollTop / h) - OVERSCAN) : 0;
  const end = virtualise
    ? Math.min(filtered.rows.length, start + Math.ceil(VIEWPORT / h) + OVERSCAN * 2)
    : filtered.rows.length;
  const visible = filtered.rows.slice(start, end);

  // Keep the selection in view when the keyboard moves it past the edge.
  useEffect(() => {
    if (!openId) return;
    const index = ids.indexOf(openId);
    const el = scrollRef.current;
    if (index < 0 || !el) return;
    if (virtualise) {
      const top = index * h;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (top + h > el.scrollTop + el.clientHeight) el.scrollTop = top + h - el.clientHeight;
    } else {
      document.getElementById(domId(`${base}-row`, openId))?.scrollIntoView({ block: 'nearest' });
    }
  }, [openId, ids, virtualise, h, base]);

  function onListKey(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, 1 | -1 | 'first' | 'last'> = {
      ArrowDown: 1,
      j: 1,
      ArrowUp: -1,
      k: -1,
      Home: 'first',
      End: 'last',
    };
    const move = moves[e.key];
    if (move !== undefined) {
      e.preventDefault();
      const next = step(ids, openId, move);
      if (next) onSelect(next);
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      headingRef.current?.focus();
    }
  }

  function onDetailKey(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      listRef.current?.focus();
    }
  }

  // --- resizing: pointer and keyboard both, since a separator you can only drag is not one.
  const drag = useRef<{ x: number; width: number } | null>(null);
  const onSeparatorDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, width };
  };
  const onSeparatorMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) setWidth(drag.current.width + e.clientX - drag.current.x);
  };
  const onSeparatorUp = () => {
    drag.current = null;
  };
  const onSeparatorKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const to: Record<string, number> = {
      ArrowLeft: width - WIDTH.step,
      ArrowRight: width + WIDTH.step,
      Home: WIDTH.min,
      End: WIDTH.max,
    };
    if (e.key in to) {
      e.preventDefault();
      setWidth(to[e.key]);
    }
  };

  const occupants = (slot: keyof ListDetailManifest['slots']): readonly Occupant[] => manifest.slots[slot] ?? [];
  const render = (o: Occupant, record: Row | null) => {
    const Panel = panelFor(o.panel);
    return (
      <Panel
        key={o.id}
        occupant={o}
        manifest={manifest}
        descriptor={descriptor}
        rows={list.rows}
        record={record}
        context={context}
      />
    );
  };

  const createButton = onCreate ? (
    <Button variant="primary" size="md" onClick={onCreate}>
      {descriptor.create.title}
    </Button>
  ) : null;

  const header = (
    <PageHeader title={manifest.title} description={manifest.description} actions={createButton} />
  );

  if (list.status === 'error') {
    return (
      <PageBody>
        {header}
        <Card>
          <ErrorState
            title={`Could not load ${noun.plural}`}
            description={error}
            onRetry={onRetry}
          />
        </Card>
      </PageBody>
    );
  }

  const empty = list.status === 'ready' && list.rows.length === 0;
  const filtering = filter.query !== '' || Object.keys(filter.facets).length > 0;
  const listLabel = `All ${noun.plural}`;

  return (
    <PageBody>
      {header}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-0">
        <div
          className="min-w-0 lg:w-[var(--list-w)] lg:shrink-0"
          style={{ '--list-w': `${width / 16}rem` } as CSSProperties}
        >
          <Card label={listLabel}>
            {occupants('list.toolbar').length > 0 ? (
              <div className="flex flex-col gap-2 border-b border-border p-card">
                {occupants('list.toolbar').map((o) => render(o, null))}
              </div>
            ) : null}

            {list.status === 'loading' ? (
              <LoadingState label={`Loading ${noun.plural}`} />
            ) : empty ? (
              <EmptyState
                title={manifest.params.list.empty.title}
                description={manifest.params.list.empty.description}
                action={createButton}
              />
            ) : (
              <>
                <div className="flex flex-col gap-2 border-b border-border p-card">
                  <Input
                    ref={filterRef}
                    type="search"
                    value={filter.query}
                    onChange={(e) => onFilter({ ...filter, query: e.target.value })}
                    placeholder={`Filter ${noun.plural}…`}
                    aria-label={`Filter ${noun.plural}`}
                    aria-keyshortcuts="/"
                  />
                  {facets.map((field) => {
                    const counts = filtered.counts[field.field] ?? {};
                    const all = Object.values(counts).reduce((a, b) => a + b, 0);
                    const id = `${base}-facet-${field.field.replace(/\W/g, '_')}`;
                    return (
                      <div key={field.field} className="flex items-center justify-between gap-2">
                        <label htmlFor={id} className="min-w-0 truncate text-label text-content-subtle">
                          {field.label}
                        </label>
                        <Select
                          id={id}
                          className="w-auto max-w-[60%]"
                          value={field.field in filter.facets ? `=${filter.facets[field.field]}` : ''}
                          onChange={(e) => {
                            const facetsNext = { ...filter.facets };
                            if (e.target.value === '') delete facetsNext[field.field];
                            else facetsNext[field.field] = e.target.value.slice(1);
                            onFilter({ ...filter, facets: facetsNext });
                          }}
                        >
                          <option value="">All ({all})</option>
                          {facetOptions(field).map((o) => (
                            // Prefixed so the empty value of an option ("delivered by
                            // nothing") is not confused with "all".
                            <option key={o.value} value={`=${o.value}`}>
                              {o.label} ({counts[o.value] ?? 0})
                            </option>
                          ))}
                        </Select>
                      </div>
                    );
                  })}
                </div>

                {filtered.rows.length === 0 ? (
                  <EmptyState
                    title={`No ${noun.plural} match`}
                    description="Nothing in the list meets every filter chosen."
                    action={
                      <Button variant="secondary" size="sm" onClick={() => onFilter({ query: '', facets: {} })}>
                        Clear filters
                      </Button>
                    }
                  />
                ) : (
                  <div
                    ref={scrollRef}
                    className="overflow-auto"
                    style={{ maxHeight: `${VIEWPORT / 16}rem` }}
                    onScroll={virtualise ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
                  >
                    <div
                      ref={listRef}
                      role="listbox"
                      aria-label={capitalise(noun.plural)}
                      tabIndex={0}
                      aria-activedescendant={openId ? domId(`${base}-row`, openId) : undefined}
                      onKeyDown={onListKey}
                      className="outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                      style={
                        virtualise
                          ? { paddingTop: start * h, paddingBottom: (filtered.rows.length - end) * h }
                          : undefined
                      }
                    >
                      {visible.map((row, i) => {
                        const id = identity(row);
                        const isOpen = id === openId;
                        const subtitle = manifest.params.list.subtitle;
                        return (
                          <div
                            key={id}
                            id={domId(`${base}-row`, id)}
                            role="option"
                            aria-selected={isOpen}
                            aria-setsize={filtered.rows.length}
                            aria-posinset={start + i + 1}
                            onClick={() => {
                              onSelect(id);
                              listRef.current?.focus();
                            }}
                            className={cn(
                              'cursor-pointer border-b border-l-2 border-b-border px-cell py-cell-y last:border-b-0',
                              isOpen ? 'border-l-accent bg-accent-subtle' : 'border-l-transparent hover:bg-surface-sunken'
                            )}
                          >
                            <p className="truncate text-body font-medium text-content">
                              {String(getPath(row, manifest.params.list.title) ?? '')}
                            </p>
                            {subtitle ? (
                              <p className="truncate font-mono text-label text-content-subtle">
                                {String(getPath(row, subtitle) ?? '')}
                              </p>
                            ) : null}
                            {columns.length > 0 ? (
                              <p className="mt-1 flex flex-wrap gap-1">
                                {columns.map((c) => (
                                  <span key={c.field}>
                                    <span className="sr-only">{c.label}: </span>
                                    <Badge tone="outline">{cell(row, c, context.optionSources).text}</Badge>
                                  </span>
                                ))}
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <p className="border-t border-border px-card py-2 text-label text-content-subtle" aria-live="polite">
                  {countLabel(filtered.rows.length, list.rows.length, noun)}
                  {filtering && filtered.rows.length > 0 ? ' · filtered' : ''}
                </p>
              </>
            )}
          </Card>
        </div>

        {!empty && list.status === 'ready' ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the list"
            aria-valuenow={width}
            aria-valuemin={WIDTH.min}
            aria-valuemax={WIDTH.max}
            tabIndex={0}
            onPointerDown={onSeparatorDown}
            onPointerMove={onSeparatorMove}
            onPointerUp={onSeparatorUp}
            onKeyDown={onSeparatorKey}
            className="hidden w-3 shrink-0 cursor-col-resize self-stretch rounded outline-none hover:bg-border focus-visible:bg-accent-subtle focus-visible:outline-2 focus-visible:outline-accent lg:block"
          />
        ) : null}

        {open ? (
          <DetailPane
            key={openId}
            base={base}
            manifest={manifest}
            descriptor={descriptor}
            record={open}
            tab={tab}
            onTab={onTab}
            onEdit={onEdit}
            onKeyDown={onDetailKey}
            headingRef={headingRef}
            render={render}
          />
        ) : null}
      </div>
    </PageBody>
  );
}

interface DetailPaneProps {
  base: string;
  manifest: ListDetailManifest;
  descriptor: EntityDescriptor;
  record: Row;
  tab: string | null;
  onTab: (id: string) => void;
  onEdit?: (row: Row) => void;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  render: (o: Occupant, record: Row | null) => React.ReactNode;
}

function DetailPane({
  base,
  manifest,
  descriptor,
  record,
  tab,
  onTab,
  onEdit,
  onKeyDown,
  headingRef,
  render,
}: DetailPaneProps) {
  const { detail, list } = manifest.params;
  const title = String(getPath(record, list.title) ?? '');
  const description = detail.description ? getPath(record, detail.description) : undefined;
  const tabs = manifest.slots['detail.tabs'];
  const aside = manifest.slots['detail.aside'] ?? [];
  const actions = manifest.slots['detail.actions'] ?? [];
  const active = tabs.find((t) => t.id === tab)?.id ?? tabs[0]?.id;
  const headingId = `${base}-detail-heading`;

  return (
    <section
      aria-labelledby={headingId}
      onKeyDown={onKeyDown}
      className="min-w-0 flex-1 rounded-xl border border-border bg-surface shadow"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-card py-3.5">
        <div className="min-w-0">
          <h2
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold tracking-tight text-content outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {title}
          </h2>
          <p className="mt-0.5 text-label text-content-muted">
            {description ? String(description) : 'No description.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions.map((o) => render(o, record))}
          {onEdit ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onEdit(record)}
              aria-label={`Edit ${descriptor.noun.singular} ${title}`}
            >
              Edit
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-col gap-4 p-card xl:flex-row">
        <div className="min-w-0 flex-1">
          {tabs.length === 1 ? (
            render(tabs[0], record)
          ) : (
            <Tabs.Root value={active} onValueChange={onTab}>
              <Tabs.List aria-label={`${title}: sections`} className="mb-4 flex gap-1 border-b border-border">
                {tabs.map((t) => (
                  <Tabs.Trigger
                    key={t.id}
                    value={t.id}
                    className="-mb-px border-b-2 border-transparent px-3 py-2 text-body text-content-muted hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent data-[state=active]:border-accent data-[state=active]:font-medium data-[state=active]:text-content"
                  >
                    {t.label}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
              {tabs.map((t) => (
                <Tabs.Content
                  key={t.id}
                  value={t.id}
                  className="outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  {render(t, record)}
                </Tabs.Content>
              ))}
            </Tabs.Root>
          )}
        </div>
        {aside.length > 0 ? (
          <aside className="flex flex-col gap-3 xl:w-72 xl:shrink-0">{aside.map((o) => render(o, record))}</aside>
        ) : null}
      </div>

      <FooterStrip record={record} footer={detail.footer} />
    </section>
  );
}

/**
 * Version, state, last edit, author — whichever of the four the record has.
 * An entity with no versions shows none rather than an invented `v1`.
 */
function FooterStrip({
  record,
  footer,
}: {
  record: Row;
  footer: ListDetailManifest['params']['detail']['footer'];
}) {
  const value = (field?: string) => (field ? getPath(record, field) : undefined);
  const parts: string[] = [];
  const version = value(footer.version);
  const state = value(footer.state);
  const at = value(footer.editedAt);
  const by = value(footer.editedBy);
  if (version !== undefined && version !== null) parts.push(`v${String(version)}`);
  if (state) parts.push(String(state));
  if (at) {
    const when = new Date(String(at)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    parts.push(by ? `edited ${when} by ${String(by)}` : `edited ${when}`);
  } else if (by) {
    parts.push(`edited by ${String(by)}`);
  }
  if (parts.length === 0) return null;
  return (
    <footer className="border-t border-border px-card py-2 text-label text-content-subtle">
      {parts.join(' · ')}
    </footer>
  );
}
