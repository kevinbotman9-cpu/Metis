'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { descriptorFor } from '@metis/ui-metadata';
import { FormDialog } from '@/components/ui/form-dialog';
import { ApiError } from '@/lib/api-client';

/**
 * Confirms deleting one record, in the words its descriptor declares.
 *
 * A refusal is shown in the dialog, verbatim, and the dialog stays open: every
 * delete the platform refuses says what depends on the record and what to do
 * instead (G-110), and that sentence is worth more than a generic failure. The
 * caller supplies the write, as `EntityFormDialog` takes `save`, because the
 * client's method is not derivable from a schema name.
 */
export interface DeleteDialogProps<T extends object> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A schema name in the metadata registry, with `remove` copy. */
  entity: string;
  record: T | null;
  /** How the person knows the record: its name, or its key when it has none. */
  name: string;
  remove: (record: T) => Promise<void>;
  /** Query keys to invalidate once the delete lands. */
  invalidate?: readonly (readonly unknown[])[];
  onDeleted?: (record: T) => void;
}

export function DeleteDialog<T extends object>({
  open,
  onOpenChange,
  entity,
  record,
  name,
  remove,
  invalidate = [],
  onDeleted,
}: DeleteDialogProps<T>) {
  const descriptor = descriptorFor(entity);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (target: T) => remove(target),
    onSuccess: (_done, target) => {
      for (const key of invalidate) queryClient.invalidateQueries({ queryKey: [...key] });
      onOpenChange(false);
      onDeleted?.(target);
    },
  });

  const copy = descriptor.remove;
  if (!copy) {
    throw new Error(`${entity} declares no delete in the metadata registry, so nothing may offer one.`);
  }

  const refusal =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? `Could not delete ${name}.`
        : null;

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        // A refusal belongs to the attempt it answered, not to the next opening.
        if (!next) mutation.reset();
        onOpenChange(next);
      }}
      title={copy.title}
      description={copy.description}
      submitLabel={copy.confirmLabel}
      tone="danger"
      busy={mutation.isPending}
      busyLabel="Deleting…"
      error={refusal}
      onSubmit={() => record && mutation.mutate(record)}
    >
      <p className="text-body text-content">
        <span className="font-medium">{name}</span>
      </p>
    </FormDialog>
  );
}
