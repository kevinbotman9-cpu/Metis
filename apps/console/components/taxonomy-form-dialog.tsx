'use client';

import { useMemo } from 'react';
import { EntityFormDialog } from '@/components/entity-form-dialog';
import { apiClient, type CategoryDto, type ObjectiveDto } from '@/lib/api-client';

/**
 * Authoring the taxonomy from the console.
 *
 * Two wrappers, and between them about twenty lines. The fields, the
 * validation, the objective dependency and the locked key all live in
 * `packages/ui-metadata/src/registry/{objective,category}.ts`; what is left
 * here is the one thing that is genuinely per-entity, which is which generated
 * client method writes it.
 *
 * `EntityFormDialog` already resolves `taxonomy.objectives` as an option
 * source, because the Offer form needed it — so the category form's objective
 * select works with no change to that component.
 */

interface DialogProps<T> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent to create. Present to edit that record. */
  record?: T;
  onSaved?: (record: T) => void;
}

/** Query keys that go stale when either level of the taxonomy changes. */
const INVALIDATE = [['taxonomy'], ['offers']] as const;

export interface ObjectiveFormDialogProps extends DialogProps<ObjectiveDto> {
  /**
   * Where a new objective lands in the taxonomy.
   *
   * An empty number field sends `0` — `toPayload` reads `Number(raw || 0)` —
   * and `sortOrder: 0` puts a brand new objective above everything that
   * existed, which is not what "I left that box alone" means. The screen knows
   * how many there are, so it fills the box in and the person can see the
   * answer and change it before saving.
   */
  nextSortOrder?: number;
}

export function ObjectiveFormDialog({
  open,
  onOpenChange,
  record,
  nextSortOrder,
  onSaved,
}: ObjectiveFormDialogProps) {
  const defaults = useMemo(
    () => (nextSortOrder === undefined ? undefined : { sortOrder: nextSortOrder }),
    [nextSortOrder]
  );

  return (
    <EntityFormDialog<ObjectiveDto>
      open={open}
      onOpenChange={onOpenChange}
      entity="Objective"
      record={record ?? null}
      defaults={defaults}
      save={(body, existing) =>
        existing
          ? apiClient.updateObjective(existing.id, body as Partial<ObjectiveDto>)
          : apiClient.createObjective(body as Partial<ObjectiveDto>)
      }
      invalidate={INVALIDATE}
      onSaved={onSaved}
    />
  );
}

export interface CategoryFormDialogProps extends DialogProps<CategoryDto> {
  /**
   * Pre-selected objective when the category is created from inside one.
   *
   * The screen is list–detail: categories are added from the objective that
   * owns them, so asking which objective again would be asking a question the
   * click already answered.
   */
  objectiveId?: string;
  /** Where a new category lands under that objective. See `nextSortOrder` above. */
  nextSortOrder?: number;
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  record,
  objectiveId,
  nextSortOrder,
  onSaved,
}: CategoryFormDialogProps) {
  const defaults = useMemo(() => {
    const seed: Record<string, unknown> = {};
    if (objectiveId) seed.objectiveId = objectiveId;
    if (nextSortOrder !== undefined) seed.sortOrder = nextSortOrder;
    return Object.keys(seed).length ? seed : undefined;
  }, [objectiveId, nextSortOrder]);

  return (
    <EntityFormDialog<CategoryDto>
      open={open}
      onOpenChange={onOpenChange}
      entity="Category"
      record={record ?? null}
      defaults={defaults}
      save={(body, existing) =>
        existing
          ? apiClient.updateCategory(existing.id, body as Partial<CategoryDto>)
          : apiClient.createCategory(body as Partial<CategoryDto>)
      }
      invalidate={INVALIDATE}
      onSaved={onSaved}
    />
  );
}
