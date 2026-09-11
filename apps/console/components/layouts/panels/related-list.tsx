import { descriptorFor, getPath, type ListColumn } from '@metis/ui-metadata';
import { Badge, EmptyState, ErrorState, LoadingState } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { cell, columnsFrom, countLabel } from '@/lib/layouts/list';
import type { Row } from '@/lib/layouts/sources';
import type { PanelProps } from '../panel';

/**
 * `core.related-list` — the records filed under the open one.
 *
 * Categories under an objective today; the spec's own list–detail sketch has
 * the same shape for creatives under an offer (§4.1). Each row is editable
 * through its entity's descriptor, and a new one is created from here already
 * filed under the open record — the click answered which, so the form does not
 * ask again.
 *
 * Written for the second screen ADR-015 converted, which could not be built
 * from a manifest alone without it. Its parameters are checked against the
 * child's descriptor like a manifest's own (`PANELS` in ui-metadata).
 */
interface Params {
  source: string;
  entity: string;
  /** The child's field holding the open record's identity. */
  by: string;
  title: string;
  subtitle?: string;
  description?: string;
  sort?: string;
  columns?: readonly ListColumn[];
  /** `{field}` in `href` is that field of the row. */
  link?: { label: string; href: string };
  empty: { title: string; description: string };
}

const fill = (template: string, row: Row) =>
  template.replace(/\{([\w.]+)\}/g, (_, field: string) => encodeURIComponent(String(getPath(row, field) ?? '')));

export function RelatedList({ occupant, recordId, context }: PanelProps) {
  const p = occupant.params as unknown as Params;
  const child = descriptorFor(p.entity);
  const source = context.sources[p.source];
  const columns = columnsFrom(p.columns ?? [], child);
  const { Link } = context;

  if (!source || source.status === 'loading') return <LoadingState label={`Loading ${child.noun.plural}`} />;
  if (source.status === 'error') return <ErrorState title={`Could not load ${child.noun.plural}`} />;

  const children = source.rows
    .filter((r) => String(getPath(r, p.by) ?? '') === recordId)
    .sort((a, b) => Number(getPath(a, p.sort ?? '') ?? 0) - Number(getPath(b, p.sort ?? '') ?? 0));
  const create = context.canEdit(p.entity) ? (
    <Button
      variant="primary"
      size="sm"
      onClick={() => context.create(p.entity, { defaults: { [p.by]: recordId }, siblings: children })}
    >
      {child.create.title}
    </Button>
  ) : null;

  if (children.length === 0) {
    return <EmptyState title={p.empty.title} description={p.empty.description} action={create} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-label text-content-subtle">{countLabel(children.length, children.length, child.noun)}</p>
        {create}
      </div>
      <ul aria-label={child.noun.plural.charAt(0).toUpperCase() + child.noun.plural.slice(1)} className="flex flex-col gap-2">
        {children.map((row) => {
          const title = String(getPath(row, p.title) ?? '');
          const subtitle = p.subtitle ? getPath(row, p.subtitle) : undefined;
          const description = p.description ? getPath(row, p.description) : undefined;
          return (
            <li
              key={String(row.id ?? title)}
              className="flex flex-wrap items-center justify-between gap-3 rounded border border-border px-cell py-cell-y"
            >
              <div className="min-w-0">
                <p className="truncate text-body font-medium text-content">{title}</p>
                {subtitle || description ? (
                  <p className="truncate text-label text-content-subtle">
                    {subtitle ? <span className="font-mono">{String(subtitle)}</span> : null}
                    {subtitle && description ? ' · ' : null}
                    {description ? String(description) : null}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {columns.map((c) => (
                  <span key={c.field}>
                    <span className="sr-only">{c.label}: </span>
                    <Badge tone="outline">{cell(row, c, context.optionSources).text}</Badge>
                  </span>
                ))}
                {p.link ? (
                  <Link href={fill(p.link.href, row)} className="text-label text-accent underline-offset-2 hover:underline">
                    {p.link.label}
                  </Link>
                ) : null}
                {context.canEdit(p.entity) ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => context.edit(p.entity, row)}
                    aria-label={`Edit ${child.noun.singular} ${title}`}
                  >
                    Edit
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
