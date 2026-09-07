'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormDialog } from '@/components/ui/form-dialog';
import { Field, Input, Select } from '@/components/ui/primitives';
import { apiClient, ApiError, type OfferDto } from '@/lib/api-client';

/**
 * Authoring an offer from the console.
 *
 * `New offer` and `Edit` were rendered enabled and did nothing — Phase C's C-1.
 * This is what they open.
 *
 * **Status is not here.** Creating an offer produces a draft and activation is
 * refused until the offer has an active creative, so putting a status control
 * in this form would offer a choice the server refuses. It lives on the detail
 * page beside the creatives, which is where the reason is visible.
 *
 * Money is entered in major units because that is what people think in, and
 * stored in minor units because that is what the domain holds. The conversion
 * is here rather than in the caller so there is one place to get it wrong.
 */

export interface OfferFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absent for a new offer. Present to edit that one. */
  offer?: OfferDto;
  onSaved?: (offer: OfferDto) => void;
}

interface FormState {
  name: string;
  key: string;
  description: string;
  objectiveId: string;
  categoryId: string;
  price: string;
  cost: string;
  expectedMargin: string;
  termMonths: string;
  boost: string;
  tags: string;
}

const empty: FormState = {
  name: '',
  key: '',
  description: '',
  objectiveId: '',
  categoryId: '',
  price: '',
  cost: '',
  expectedMargin: '',
  termMonths: '24',
  boost: '1',
  tags: '',
};

const major = (minor: number) => (minor / 100).toFixed(2);
const minor = (value: string) => Math.round(Number(value || 0) * 100);

/** `Speed Boost 100Mb` → `speed_boost_100mb`. Suggested, never imposed. */
const suggestKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);

export function OfferFormDialog({ open, onOpenChange, offer, onSaved }: OfferFormDialogProps) {
  const editing = Boolean(offer);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);
  const [keyTouched, setKeyTouched] = useState(false);

  const { data: taxonomy } = useQuery({
    queryKey: ['taxonomy'],
    queryFn: () => apiClient.getTaxonomy(),
    enabled: open,
  });

  // Reset on open rather than on mount: the dialog stays mounted between
  // openings, so a stale draft would otherwise survive a cancel.
  useEffect(() => {
    if (!open) return;
    setKeyTouched(Boolean(offer));
    setForm(
      offer
        ? {
            name: offer.name,
            key: offer.key,
            description: offer.description,
            objectiveId: offer.objectiveId,
            categoryId: offer.categoryId,
            price: major(offer.financials.price.amount),
            cost: major(offer.financials.cost.amount),
            expectedMargin: major(offer.financials.expectedMargin.amount),
            termMonths: String(offer.financials.termMonths),
            boost: String(offer.boost),
            tags: offer.tags.join(', '),
          }
        : empty
    );
  }, [open, offer]);

  const categories = useMemo(
    () =>
      (taxonomy?.categories ?? []).filter(
        (c) => !form.objectiveId || c.objectiveId === form.objectiveId
      ),
    [taxonomy, form.objectiveId]
  );

  const save = useMutation({
    mutationFn: async () => {
      const currency = offer?.financials.price.currency ?? 'GBP';
      const body: Partial<OfferDto> = {
        name: form.name.trim(),
        key: form.key.trim(),
        description: form.description.trim(),
        objectiveId: form.objectiveId,
        categoryId: form.categoryId,
        boost: Number(form.boost || 1),
        tags: form.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        financials: {
          price: { amount: minor(form.price), currency },
          cost: { amount: minor(form.cost), currency },
          expectedMargin: { amount: minor(form.expectedMargin), currency },
          termMonths: Number(form.termMonths || 0),
          oneOff: Number(form.termMonths || 0) === 0,
        },
      };
      return offer ? apiClient.updateOffer(offer.id, body) : apiClient.createOffer(body);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      queryClient.invalidateQueries({ queryKey: ['offer', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['taxonomy'] });
      onOpenChange(false);
      onSaved?.(saved);
    },
  });

  const problems = save.error instanceof ApiError ? save.error.problems : [];
  const problemFor = (field: string) => problems.find((p) => p.field === field)?.message;
  const banner =
    save.error instanceof ApiError && problems.length === 0 ? save.error.message : null;

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${offer?.name}` : 'New offer'}
      description={
        editing
          ? 'Changes apply immediately and are written to the audit log.'
          : 'A new offer starts as a draft. It can go active once it has a creative.'
      }
      submitLabel={editing ? 'Save offer' : 'Create offer'}
      busy={save.isPending}
      error={banner}
      onSubmit={() => save.mutate()}
    >
      <Field label="Name" htmlFor="offer-name" error={problemFor('name')}>
        <Input
          id="offer-name"
          value={form.name}
          required
          onChange={(e) => {
            const name = e.target.value;
            set(keyTouched ? { name } : { name, key: suggestKey(name) });
          }}
        />
      </Field>

      <Field
        label="Key"
        htmlFor="offer-key"
        hint="The action a decision names. Stable for the life of the offer."
        error={problemFor('key')}
      >
        <Input
          id="offer-key"
          value={form.key}
          required
          // An offer's key appears in every decision record ever written about
          // it, so changing one after the fact would orphan history.
          disabled={editing}
          onChange={(e) => {
            setKeyTouched(true);
            set({ key: e.target.value });
          }}
        />
      </Field>

      <Field label="Description" htmlFor="offer-description">
        <Input
          id="offer-description"
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Objective" htmlFor="offer-objective">
          <Select
            id="offer-objective"
            value={form.objectiveId}
            required
            onChange={(e) => set({ objectiveId: e.target.value, categoryId: '' })}
          >
            <option value="">Choose…</option>
            {(taxonomy?.objectives ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Category" htmlFor="offer-category" error={problemFor('categoryId')}>
          <Select
            id="offer-category"
            value={form.categoryId}
            required
            disabled={!form.objectiveId}
            onChange={(e) => set({ categoryId: e.target.value })}
          >
            <option value="">{form.objectiveId ? 'Choose…' : 'Pick an objective first'}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Price / month" htmlFor="offer-price">
          <Input
            id="offer-price"
            type="number"
            step="0.01"
            min="0"
            value={form.price}
            onChange={(e) => set({ price: e.target.value })}
          />
        </Field>
        <Field label="Cost to serve" htmlFor="offer-cost">
          <Input
            id="offer-cost"
            type="number"
            step="0.01"
            min="0"
            value={form.cost}
            onChange={(e) => set({ cost: e.target.value })}
          />
        </Field>
        <Field
          label="Expected margin"
          htmlFor="offer-margin"
          hint="Over the term. Ranking reads this."
        >
          <Input
            id="offer-margin"
            type="number"
            step="0.01"
            min="0"
            value={form.expectedMargin}
            onChange={(e) => set({ expectedMargin: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Term (months)" htmlFor="offer-term" hint="0 for one-off.">
          <Input
            id="offer-term"
            type="number"
            min="0"
            value={form.termMonths}
            onChange={(e) => set({ termMonths: e.target.value })}
          />
        </Field>
        <Field label="Boost" htmlFor="offer-boost" hint="1.0 is neutral.">
          <Input
            id="offer-boost"
            type="number"
            step="0.05"
            min="0"
            value={form.boost}
            onChange={(e) => set({ boost: e.target.value })}
          />
        </Field>
        <Field label="Tags" htmlFor="offer-tags" hint="Comma separated.">
          <Input
            id="offer-tags"
            value={form.tags}
            onChange={(e) => set({ tags: e.target.value })}
          />
        </Field>
      </div>
    </FormDialog>
  );
}
