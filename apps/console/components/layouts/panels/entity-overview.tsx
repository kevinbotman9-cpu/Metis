import { getPath, layout, toFormState } from '@metis/ui-metadata';
import { display } from '@/lib/layouts/list';
import { cn } from '@/lib/cn';
import type { PanelProps } from '../panel';

/**
 * `core.entity-overview` — the record's descriptor, read-only.
 *
 * The same fields, groups, order and visibility rules as the edit form, because
 * it reads the same descriptor: a field added there appears here with no change
 * to any manifest or page, which is Rule 8 carried one level up (ADR-015 §6). A
 * web placement shows its shape and an email one does not, for the same reason
 * the form asks for it on one and not the other.
 *
 * The title and description fields are left out: the pane's header already
 * shows both.
 */
export function EntityOverview({ record, descriptor, manifest, context }: PanelProps) {
  if (!record) return null;
  const shownElsewhere = new Set([manifest.params.list.title, manifest.params.detail.description]);
  const groups = layout(descriptor, toFormState(descriptor, record), context.permissions)
    .map(({ group, fields }) => ({ group, fields: fields.filter((f) => !shownElsewhere.has(f.field)) }))
    .filter((g) => g.fields.length > 0);
  const { Link } = context;

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ group, fields }) => (
        <section key={group.key} aria-label={group.label}>
          {group.label ? (
            <h3 className="mb-2 text-label font-semibold uppercase tracking-wide text-content-subtle">
              {group.label}
            </h3>
          ) : null}
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {fields.map((field) => {
              const shown = display(field, getPath(record, field.field), context.optionSources);
              return (
                <div key={field.field} className="min-w-0">
                  <dt className="text-label text-content-subtle">{field.label}</dt>
                  <dd
                    className={cn(
                      'break-words text-body',
                      shown.empty ? 'text-content-subtle' : 'text-content'
                    )}
                  >
                    {shown.href ? (
                      <Link href={shown.href} className="text-accent underline-offset-2 hover:underline">
                        {shown.text}
                      </Link>
                    ) : (
                      shown.text
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}
