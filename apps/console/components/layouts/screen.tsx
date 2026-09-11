'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import NextLink from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import { descriptorFor, layoutFor, type LayoutManifest, type ListDetailManifest } from '@metis/ui-metadata';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import { EntityFormDialog } from '@/components/entity-form-dialog';
import { LoadingState, PageBody } from '@/components/ui/primitives';
import { useOptionSources } from '@/lib/option-sources';
import { bindingFor, sourceFor, type Row } from '@/lib/layouts/sources';
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

interface Dialog {
  entity: string;
  record: Row | null;
  defaults?: Record<string, unknown>;
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

  // --- data: every named source, resolved here and handed down.
  const names = useMemo(() => sourcesOf(manifest), [manifest]);
  const results = useQueries({
    queries: names.map((name) => {
      const source = sourceFor(name);
      return { queryKey: source.queryKey, queryFn: source.queryFn, select: source.select };
    }),
  });
  // Row arrays are stable between renders — TanStack memoises `select` — so
  // nothing below needs this object itself to be.
  const sources: Record<string, SourceState> = Object.fromEntries(
    names.map((name, i): [string, SourceState] => {
      const r = results[i];
      return [name, { rows: r.data ?? NO_ROWS, status: r.isError ? 'error' : r.isPending ? 'loading' : 'ready' }];
    })
  );
  const list = sources[manifest.params.list.source];
  const failed = results.find((r) => r.isError);
  const optionSources = useOptionSources(true);

  // --- navigation state, in the URL.
  const selectionParam = entity.charAt(0).toLowerCase() + entity.slice(1);
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
    (id: string) => replace((next) => next.set(selectionParam, id)),
    [replace, selectionParam]
  );
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
  const canEdit = useCallback((e: string) => hasPermission(bindingFor(e).permission), [hasPermission]);
  const context: PanelContext = {
    sources,
    optionSources,
    permissions: user?.permissions ?? [],
    canEdit,
    create: (e, defaults) =>
      setDialog({ entity: e, record: null, defaults: { ...bindingFor(e).defaults?.([]), ...defaults } }),
    edit: (e, record) => setDialog({ entity: e, record }),
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
        selected={params.get(selectionParam)}
        onSelect={onSelect}
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
                  // The detail pane opens on what was just made.
                  onSaved: (saved) => onSelect(binding.identity(saved)),
                })
            : undefined
        }
        onEdit={editable ? (record) => setDialog({ entity, record }) : undefined}
        context={context}
      />
      {dialog ? (
        <EntityFormDialog<Row>
          open
          onOpenChange={(open) => !open && setDialog(null)}
          entity={dialog.entity}
          record={dialog.record}
          defaults={dialog.defaults}
          save={bindingFor(dialog.entity).save}
          invalidate={bindingFor(dialog.entity).invalidate}
          onSaved={dialog.onSaved}
        />
      ) : null}
    </>
  );
}
