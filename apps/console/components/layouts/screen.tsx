'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { descriptorFor, layoutFor, type LayoutManifest, type ListDetailManifest } from '@metis/ui-metadata';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import { EntityFormDialog } from '@/components/entity-form-dialog';
import { DeleteDialog } from '@/components/delete-dialog';
import { LoadingState, PageBody } from '@/components/ui/primitives';
import { useOptionSources } from '@/lib/option-sources';
import {
  bindingFor,
  invalidationsFor,
  isRecordSource,
  sourceFor,
  type ListSource,
  type Parent,
  type RecordSource,
  type Row,
} from '@/lib/layouts/sources';
import type { ListFilter } from '@/lib/layouts/list';
import { ListDetail } from './list-detail';
import type { LinkProps, PanelContext, SourceState } from './panel';

/**
 * A declared screen. A route's `page.tsx` is `<Screen manifest="…" />` and
 * nothing else — the conformance check refuses a page that does more (ADR-015
 * §5). What the screen shows is the manifest in `packages/ui-metadata/src/layouts`;
 * how it behaves is the pattern's renderer; this is the host between them.
 *
 * The host is where a manifest's names become data and where navigation state
 * lives: it resolves every source the manifest names, keeps the selection, the
 * open tab and the filters in the URL so each can be linked and gone back from,
 * and owns the create and edit dialogs. Viewing is enforced by `RequireAuth`
 * from the navigation manifest; editing by the entity's binding.
 */
export function Screen({ manifest: id }: { manifest: string }) {
  const manifest = layoutFor(id);
  return (
    <RequireAuth>
      {/* The host reads the query string, which a prerendered page does not have. */}
      <Suspense
        fallback={
          <PageBody>
            <LoadingState />
          </PageBody>
        }
      >
        <PatternHost manifest={manifest} />
      </Suspense>
    </RequireAuth>
  );
}

function PatternHost({ manifest }: { manifest: LayoutManifest }) {
  switch (manifest.pattern) {
    case 'list-detail':
      return <ListDetailHost manifest={manifest} />;
    default: {
      // A pattern the registry admits and nothing here renders is a build error,
      // not a blank page in production.
      const unrendered: never = manifest.pattern;
      throw new Error(`No renderer for pattern '${String(unrendered)}'.`);
    }
  }
}

/** Every source a manifest names: its list, and whatever its panels read. */
function sourcesOf(manifest: ListDetailManifest): string[] {
  const named = new Set<string>([manifest.params.list.source]);
  for (const occupants of Object.values(manifest.slots)) {
    for (const o of occupants ?? []) {
      const source = o.params?.source;
      if (typeof source === 'string') named.add(source);
    }
  }
  return [...named];
}

const Link = ({ href, className, children }: LinkProps) => (
  <NextLink href={href} className={className}>
    {children}
  </NextLink>
);

const NO_ROWS: Row[] = [];

const keyOf = (queryKey: readonly unknown[]) => JSON.stringify(queryKey);
const unique = (keys: string[]) => [...new Set(keys)];

/**
 * A source's rows from an answer, computed once per answer.
 *
 * The answer object is TanStack's cached reference, so it only changes when the
 * data does; keying the rows on it keeps each source's array stable between
 * renders, which the filters and the open-record effect depend on.
 */
const selections = new WeakMap<(data: unknown) => Row[], WeakMap<object, Row[]>>();
function selectOnce(select: (data: unknown) => Row[], data: unknown): Row[] {
  if (data === null || typeof data !== 'object') return NO_ROWS;
  let byAnswer = selections.get(select);
  if (!byAnswer) {
    byAnswer = new WeakMap();
    selections.set(select, byAnswer);
  }
  let rows = byAnswer.get(data);
  if (!rows) {
    rows = select(data);
    byAnswer.set(data, rows);
  }
  return rows;
}

interface Dialog {
  entity: string;
  record: Row | null;
  defaults?: Record<string, unknown>;
  /** The open record, when the form writes a record filed under it. */
  parent: Parent | null;
  onSaved?: (saved: Row) => void;
}

function ListDetailHost({ manifest }: { manifest: ListDetailManifest }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user, hasPermission } = useAuth();

  const { entity } = manifest.params.detail;
  const descriptor = descriptorFor(entity);
  const binding = bindingFor(entity);

  // --- data: every named source, resolved here and handed down. A source
  // scoped to a record is resolved for the open one only, once the renderer
  // says which that is.
  const names = useMemo(() => sourcesOf(manifest), [manifest]);
  const tenantWide = useMemo(() => names.filter((n) => !isRecordSource(sourceFor(n))), [names]);
  const perRecord = useMemo(() => names.filter((n) => isRecordSource(sourceFor(n))), [names]);
  const [openId, setOpenId] = useState<string | null>(null);
  // One query per distinct key. Sources over the same operation — both levels
  // of the taxonomy, or everything one offer is made of — share a key on
  // purpose, so one write refreshes all of them; asked for twice in one
  // useQueries, a key is a duplicate TanStack warns may misbehave. So the
  // answer is fetched once, and each source selects its own rows from it.
  const tenantSources = tenantWide.map((name) => sourceFor(name) as ListSource);
  const tenantKeys = unique(tenantSources.map((s) => keyOf(s.queryKey)));
  const results = useQueries({
    queries: tenantKeys.map((key) => {
      const source = tenantSources.find((s) => keyOf(s.queryKey) === key) as ListSource;
      return { queryKey: source.queryKey, queryFn: source.queryFn };
    }),
  });
  const recordSources = perRecord.map((name) => sourceFor(name) as RecordSource);
  const recordKeyOf = (s: RecordSource) => keyOf(s.queryKey(openId ?? ''));
  const recordKeys = unique(recordSources.map(recordKeyOf));
  const recordResults = useQueries({
    queries: recordKeys.map((key) => {
      const source = recordSources.find((s) => recordKeyOf(s) === key) as RecordSource;
      return {
        queryKey: source.queryKey(openId ?? ''),
        queryFn: () => source.queryFn(openId ?? ''),
        enabled: openId !== null,
      };
    }),
  });
  const stateOf = (
    r: { data?: unknown; isError: boolean; isPending: boolean },
    select: (data: unknown) => Row[]
  ): SourceState => ({
    rows: selectOnce(select, r.data),
    status: r.isError ? 'error' : r.isPending ? 'loading' : 'ready',
  });
  // Row arrays are stable between renders — `selectOnce` keeps one per answer —
  // so nothing below needs this object itself to be.
  const sources: Record<string, SourceState> = Object.fromEntries([
    ...tenantWide.map((name, i): [string, SourceState] => [
      name,
      stateOf(results[tenantKeys.indexOf(keyOf(tenantSources[i].queryKey))], tenantSources[i].select),
    ]),
    ...perRecord.map((name, i): [string, SourceState] => [
      name,
      stateOf(recordResults[recordKeys.indexOf(recordKeyOf(recordSources[i]))], recordSources[i].select),
    ]),
  ]);
  const list = sources[manifest.params.list.source];
  const listResult = results[tenantKeys.indexOf(keyOf((sourceFor(manifest.params.list.source) as ListSource).queryKey))];
  // A record's own source failing is its panel's to say. The screen fails only
  // when what it lists does.
  const failed = results.find((r) => r.isError);
  const optionSources = useOptionSources(true);

  // --- navigation state, in the URL. A screen with a detail route keeps the
  // selection in the path, so the link to one record is that record's address;
  // any other keeps it in the query string.
  const routeParams = useParams();
  const pathParam = manifest.params.detailRoute?.match(/\[(\w+)\]$/)?.[1];
  const selectionParam = entity.charAt(0).toLowerCase() + entity.slice(1);
  const fromPath = pathParam ? routeParams?.[pathParam] : undefined;
  const selected = pathParam ? ((Array.isArray(fromPath) ? fromPath[0] : fromPath) ?? null) : params.get(selectionParam);
  const replace = useCallback(
    (change: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      change(next);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );
  const onSelect = useCallback(
    (id: string) => {
      if (!pathParam) return replace((next) => next.set(selectionParam, id));
      const qs = params.toString();
      router.replace(`${manifest.route}/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`, { scroll: false });
    },
    [replace, selectionParam, pathParam, params, router, manifest.route]
  );
  const clearSelection = () => {
    if (!pathParam) return replace((next) => next.delete(selectionParam));
    const qs = params.toString();
    router.replace(`${manifest.route}${qs ? `?${qs}` : ''}`, { scroll: false });
  };
  const filter = useMemo<ListFilter>(
    () => ({
      query: params.get('q') ?? '',
      facets: Object.fromEntries(
        [...params.entries()].filter(([k]) => k.startsWith('f.')).map(([k, v]) => [k.slice(2), v])
      ),
    }),
    [params]
  );
  const onFilter = (next: ListFilter) =>
    replace((p) => {
      if (next.query) p.set('q', next.query);
      else p.delete('q');
      for (const key of [...p.keys()]) if (key.startsWith('f.')) p.delete(key);
      for (const [field, value] of Object.entries(next.facets)) p.set(`f.${field}`, value);
    });

  // --- writes: the descriptor's form, saved through the entity's binding.
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const canEdit = useCallback(
    (e: string) => Boolean(bindingFor(e).save) && hasPermission(bindingFor(e).permission),
    [hasPermission]
  );
  const canDelete = useCallback(
    (e: string) =>
      Boolean(bindingFor(e).remove && descriptorFor(e).remove) && hasPermission(bindingFor(e).permission),
    [hasPermission]
  );
  const [deleting, setDeleting] = useState<{ entity: string; record: Row; parent: Parent | null } | null>(null);
  // A panel names the open record by its identity; the entity is this screen's.
  const parentOf = (id?: string | null): Parent | null => (id ? { entity, id } : null);
  const context: PanelContext = {
    sources,
    optionSources,
    permissions: user?.permissions ?? [],
    canEdit,
    create: (e, seed) =>
      setDialog({
        entity: e,
        record: null,
        defaults: { ...bindingFor(e).defaults?.(seed?.siblings ?? []), ...seed?.defaults },
        parent: parentOf(seed?.parent),
      }),
    edit: (e, record, parent) => setDialog({ entity: e, record, parent: parentOf(parent) }),
    canDelete,
    remove: (e, record, parent) => setDeleting({ entity: e, record, parent: parentOf(parent) }),
    Link,
  };
  const editable = canEdit(entity);

  return (
    <>
      <ListDetail
        manifest={manifest}
        descriptor={descriptor}
        identity={binding.identity}
        list={list}
        error={failed?.error instanceof Error ? failed.error.message : undefined}
        onRetry={() => results.forEach((r) => r.isError && void r.refetch())}
        selected={selected}
        onSelect={onSelect}
        onOpen={setOpenId}
        refreshing={listResult?.isFetching ?? false}
        tab={params.get('tab')}
        onTab={(tab) => replace((next) => next.set('tab', tab))}
        filter={filter}
        onFilter={onFilter}
        onCreate={
          editable
            ? () =>
                setDialog({
                  entity,
                  record: null,
                  defaults: binding.defaults?.(list.rows),
                  parent: null,
                  // The detail pane opens on what was just made.
                  onSaved: (saved) => onSelect(binding.identity(saved)),
                })
            : undefined
        }
        onEdit={editable ? (record) => setDialog({ entity, record, parent: null }) : undefined}
        onDelete={canDelete(entity) ? (record) => setDeleting({ entity, record, parent: null }) : undefined}
        context={context}
      />
      {dialog ? (
        <EntityFormDialog<Row>
          open
          onOpenChange={(open) => !open && setDialog(null)}
          entity={dialog.entity}
          record={dialog.record}
          defaults={dialog.defaults}
          // Only reachable through `canEdit`, which requires the binding to have a write.
          save={(body, record) => bindingFor(dialog.entity).save!(body, record, dialog.parent)}
          invalidate={invalidationsFor(bindingFor(dialog.entity), dialog.parent)}
          onSaved={dialog.onSaved}
        />
      ) : null}
      {deleting ? (
        <DeleteDialog<Row>
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          entity={deleting.entity}
          record={deleting.record}
          name={String(deleting.record.name ?? deleting.record.key ?? deleting.record.id ?? '')}
          // Only reachable through `canDelete`, which requires the binding to have a delete.
          remove={(record) => bindingFor(deleting.entity).remove!(record, deleting.parent)}
          invalidate={invalidationsFor(bindingFor(deleting.entity), deleting.parent)}
          onDeleted={(record) => {
            // The open record is gone, so the address that named it names nothing.
            if (deleting.entity === entity && binding.identity(record) === openId) clearSelection();
          }}
        />
      ) : null}
    </>
  );
}
