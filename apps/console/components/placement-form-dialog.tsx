'use client';

import { EntityFormDialog } from '@/components/entity-form-dialog';
import { apiClient, type PlacementDto } from '@/lib/api-client';

/**
 * Configuring a slot, from the console.
 *
 * Placements were fixture-authored until 2026-09-10. Every decision ADR-013
 * describes — whether a slot is decidable, and whether anything delivers what
 * it produces — was a TypeScript edit and a redeploy away, which is exactly the
 * state the descriptor registry exists to end.
 *
 * The form is `packages/ui-metadata/src/registry/placement.ts`. What is left
 * here is which generated client method writes it.
 */

/**
 * Stable identity, so the dialog's reset effect does not re-run every render.
 *
 * `slotCount: 1` because an empty number field sends `0` — `toPayload` reads
 * `Number(raw || 0)` — and the spec's `minimum: 1` then makes the form
 * unsubmittable with no visible reason. The same trap `sortOrder` fell into on
 * the taxonomy slice, in the same week, which is a sign that how the codec
 * reads an untouched number is the thing to fix rather than each descriptor in
 * turn. Registered as G-045.
 */
const PLACEMENT_DEFAULTS = { decidable: true, slotCount: 1 };

export interface PlacementFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent for a new placement. Present to edit that one. */
  record?: PlacementDto;
  onSaved?: (placement: PlacementDto) => void;
}

export function PlacementFormDialog({
  open,
  onOpenChange,
  record,
  onSaved,
}: PlacementFormDialogProps) {
  return (
    <EntityFormDialog<PlacementDto>
      open={open}
      onOpenChange={onOpenChange}
      entity="Placement"
      record={record ?? null}
      // A new slot decides. Without this the form's boolean select opens on its
      // false option and a placement created by clicking arrives refusing every
      // request — which is a default nobody chose, and the opposite of what
      // "configure a slot" means.
      //
      // `delivery` is deliberately not defaulted: nothing delivers a new slot
      // until somebody says what does, and that *is* the honest starting state.
      defaults={PLACEMENT_DEFAULTS}
      save={(body, existing) =>
        existing
          ? apiClient.updatePlacement(existing.key, body as Partial<PlacementDto>)
          : apiClient.createPlacement(body as Partial<PlacementDto>)
      }
      // The coverage screen's denominator is the set of channels with a
      // delivery mode, so changing one here changes what that screen measures.
      invalidate={[['placements'], ['creatives'], ['offers']]}
      onSaved={onSaved}
    />
  );
}
