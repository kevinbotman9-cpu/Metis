'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  descriptorFor,
  toFormState,
  toPayload,
  type FormState,
  type Option,
} from '@metis/ui-metadata';
import { FormDialog } from '@/components/ui/form-dialog';
import { FormRenderer } from '@/components/ui/form-renderer';
import { useAuth } from '@/components/auth-provider';
import { apiClient, ApiError } from '@/lib/api-client';

/**
 * Create or edit any registered entity, from its descriptor.
 *
 * This is the whole authoring surface. It holds the dialog, the mutation and
 * the refusal handling; the descriptor holds the fields; the renderer holds
 * the field types. None of the three names an entity, which is what makes
 * adding a field a one-line change to a descriptor.
 *
 * The `save` function is passed in rather than resolved from a table here,
 * because a write is the one thing that genuinely differs per entity — the
 * generated client's method names are not derivable from a schema name, and
 * inventing a convention to make them look derivable would be a hand-rolled
 * client by another route.
 */

export interface EntityFormDialogProps<T extends object> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A schema name in the metadata registry. */
  entity: string;
  /** Absent to create. Present to edit that record. */
  record?: T | null;
  /**
   * Field values a new record starts with, when the screen already knows one.
   *
   * A category created from inside an objective starts on that objective: the
   * click answered the question, so the form should not ask it again. This is
   * not the same as passing a `record` — a record means *editing*, which locks
   * the key, switches the labels and counts every field as authored. These are
   * defaults on a create, and the person can still change them.
   */
  defaults?: Record<string, unknown>;
  /** Title when creating a new record; the descriptor supplies the default. */
  title?: string;
  save: (body: Record<string, unknown>, record: T | null) => Promise<T>;
  /** Query keys to invalidate once the write lands. */
  invalidate?: readonly (readonly unknown[])[];
  onSaved?: (record: T) => void;
}

/**
 * Named option sources, resolved once for the whole registry.
 *
 * A descriptor names a source; this maps the name to data. It is the only
 * place a descriptor's vocabulary meets a query, and it is deliberately a flat
 * table rather than a per-entity hook.
 */
function useOptionSources(enabled: boolean): Record<string, readonly Option[]> {
  const { data: taxonomy } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => apiClient.getTaxonomy(),
    enabled,
  });

  const { data: placements } = useQuery({
    queryKey: ['placements'],
    queryFn: () => apiClient.listPlacements(),
    enabled,
  });

  const { data: artifacts } = useQuery({
    queryKey: ['artifacts'],
    queryFn: () => apiClient.listArtifacts(),
    enabled,
  });

  return useMemo(
    () => ({
      'taxonomy.objectives': (taxonomy?.objectives ?? []).map((o) => ({
        value: o.id,
        label: o.name,
      })),
      'taxonomy.categories': (taxonomy?.categories ?? []).map((c) => ({
        value: c.id,
        label: c.name,
        objectiveId: c.objectiveId,
      })),
      // `channel` and `type` are carried so a descriptor can filter slots by
      // the channel chosen and suggest the shape the slot declares.
      placements: (placements?.placements ?? [])
        .filter((p) => p.decidable)
        .map((p) => ({ value: p.key, label: p.name, channel: p.channel, type: p.type })),
      // Which flow answers a slot. Active only: pointing a live placement at a
      // draft flow would put an unpublished decision in front of a customer.
      flows: (artifacts?.artifacts ?? [])
        .filter((a) => a.status === 'active')
        .map((a) => ({ value: a.id, label: a.name })),
    }),
    [taxonomy, placements, artifacts]
  );
}

export function EntityFormDialog<T extends object>({
  open,
  onOpenChange,
  entity,
  record,
  defaults,
  title,
  save,
  invalidate = [],
  onSaved,
}: EntityFormDialogProps<T>) {
  const descriptor = descriptorFor(entity);
  const editing = Boolean(record);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];

  const [form, setForm] = useState<FormState>(() => toFormState(descriptor));
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const optionSources = useOptionSources(open);

  // Reset on open rather than on mount: the dialog stays mounted between
  // openings, so a stale draft would otherwise survive a cancel.
  useEffect(() => {
    if (!open) return;
    setForm(
      toFormState(descriptor, (record ?? defaults ?? null) as Record<string, unknown> | null)
    );
    // Every field of an existing record counts as authored, so a suggestion
    // cannot overwrite a name somebody chose deliberately. Defaults on a create
    // are not authored — the key must still suggest itself from the name.
    setTouched(record ? new Set(descriptor.fields.map((f) => f.field)) : new Set());
  }, [open, record, defaults, descriptor]);

  const mutation = useMutation({
    mutationFn: () =>
      save(toPayload(descriptor, form, {
        editing,
        permissions,
        entity: (record ?? null) as Record<string, unknown> | null,
      }), record ?? null),
    onSuccess: (saved) => {
      for (const key of invalidate) queryClient.invalidateQueries({ queryKey: [...key] });
      onOpenChange(false);
      onSaved?.(saved);
    },
  });

  const raised = mutation.error instanceof ApiError ? mutation.error.problems : [];
  const problems = Object.fromEntries(
    raised.filter((p) => p.field).map((p) => [p.field as string, p.message])
  );
  const banner =
    mutation.error instanceof ApiError && raised.length === 0 ? mutation.error.message : null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={
        editing
          ? `Edit ${String((record as { name?: unknown } | null)?.name ?? descriptor.noun.singular)}`
          : (title ?? descriptor.create.title)
      }
      description={editing ? descriptor.edit.description : descriptor.create.description}
      submitLabel={editing ? descriptor.edit.submitLabel : descriptor.create.submitLabel}
      busy={mutation.isPending}
      error={banner}
      onSubmit={() => mutation.mutate()}
    >
      <FormRenderer
        descriptor={descriptor}
        form={form}
        onChange={setForm}
        editing={editing}
        permissions={permissions}
        optionSources={optionSources}
        problems={problems}
        touched={touched}
        onTouch={(field) => setTouched((t) => new Set(t).add(field))}
        idPrefix={descriptor.noun.singular}
      />
    </FormDialog>
  );
}
