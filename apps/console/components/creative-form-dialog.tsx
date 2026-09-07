'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormDialog } from '@/components/ui/form-dialog';
import { Field, Input, Select } from '@/components/ui/primitives';
import { apiClient, ApiError, type CreativeDto } from '@/lib/api-client';
import { PLACEMENT_TYPES } from '@metis/core/domain';

/**
 * Authoring the content an offer is delivered with.
 *
 * `Add creative` was rendered enabled and did nothing. This is what it opens.
 *
 * **The fields change with the channel**, because the content does: five
 * shapes, and a form that showed the union of them would ask for a deeplink on
 * an email. The shapes are declared once below, so adding a channel is one
 * entry rather than a hunt through JSX.
 *
 * **Validation is the server's.** The rules — the 160-character segment limit,
 * a carrier-legal sender id, a call to action that goes somewhere — live in
 * `@metis/core` and are enforced by the endpoint. This form renders what comes
 * back rather than re-implementing them, because two implementations of one
 * rule is one rule and one bug waiting. The only thing checked here is
 * `required`, which the browser does for free.
 *
 * **There is no upload.** `imageUrl` is a reference; the platform has no asset
 * store (W-015), and the field says so rather than implying a file picker is
 * coming.
 */

type ChannelId = 'email' | 'sms' | 'web' | 'push' | 'outbound_call';

interface FieldSpec {
  name: string;
  label: string;
  hint?: string;
  multiline?: boolean;
  /** Renders a closed set instead of a text box. */
  options?: { id: string; label: string }[];
  /**
   * Renders the tenant's configured slots, fetched when the dialog opens.
   *
   * A separate flag rather than options passed in, because which slots exist is
   * tenant data and this table is a static description of the channels.
   */
  slots?: boolean;
  /**
   * An example, shown when the input is empty.
   *
   * Written "e.g. …" without exception. A bare `/plans/example` sitting in an
   * empty box reads as a value — it was reported as one, next to a message
   * saying the field was required — and no amount of grey makes a path look
   * like an invitation to type a path.
   */
  placeholder?: string;
  /** Marked in the label, so nobody fills a field to get past a form. */
  optional?: boolean;
}

const CHANNELS: { id: ChannelId; label: string; fields: FieldSpec[] }[] = [
  {
    id: 'email',
    label: 'Email',
    fields: [
      { name: 'subject', label: 'Subject' },
      {
        name: 'preheader',
        label: 'Preheader',
        optional: true,
        hint: 'The line inboxes show after the subject. Left out, they show the start of the body.',
      },
      { name: 'body', label: 'Body', multiline: true },
      {
        name: 'fromName',
        label: 'From name',
        optional: true,
        hint: 'Left out, recipients see the address.',
      },
      { name: 'fromAddress', label: 'From address', placeholder: 'e.g. offers@example.com' },
    ],
  },
  {
    id: 'sms',
    label: 'SMS',
    fields: [
      {
        name: 'text',
        label: 'Message',
        multiline: true,
        hint: '160 characters. Longer messages are split and billed per segment.',
      },
      { name: 'senderId', label: 'Sender id', hint: 'Up to 11 characters — a carrier limit.' },
    ],
  },
  {
    id: 'web',
    label: 'Web',
    fields: [
      { name: 'headline', label: 'Headline' },
      { name: 'subheadline', label: 'Subheadline', optional: true },
      {
        name: 'imageUrl',
        label: 'Image reference',
        optional: true,
        hint: 'A path or URL. Nothing here stores or serves the file — see W-015.',
        placeholder: 'e.g. /assets/offers/example.jpg',
      },
      {
        name: 'ctaLabel',
        label: 'Call to action',
        optional: true,
        hint: 'A label and a link, or neither.',
      },
      {
        name: 'ctaUrl',
        label: 'Call to action link',
        optional: true,
        placeholder: 'e.g. /plans/example',
      },
      {
        name: 'placement',
        label: 'Placement',
        optional: true,
        slots: true,
        hint: 'The slot this is for. Left out, it can fill any slot on the channel.',
      },
      {
        name: 'placementType',
        label: 'Placement type',
        optional: true,
        options: PLACEMENT_TYPES,
        hint: 'How it is designed to look — a hero, a tile, a carousel.',
      },
    ],
  },
  {
    id: 'push',
    label: 'Push',
    fields: [
      { name: 'title', label: 'Title' },
      { name: 'body', label: 'Body', multiline: true },
      {
        name: 'deeplink',
        label: 'Deeplink',
        optional: true,
        hint: 'Left out, the notification opens the app.',
        placeholder: 'e.g. app://addons/example',
      },
    ],
  },
  {
    id: 'outbound_call',
    label: 'Outbound call',
    fields: [
      { name: 'script', label: 'Script', multiline: true },
      { name: 'objectionHandling', label: 'Objection handling', multiline: true, optional: true },
    ],
  },
];

export interface CreativeFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offerId: string;
  /** Absent to add one. Present to edit that one. */
  creative?: CreativeDto;
}

export function CreativeFormDialog({
  open,
  onOpenChange,
  offerId,
  creative,
}: CreativeFormDialogProps) {
  const editing = Boolean(creative);
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [channel, setChannel] = useState<ChannelId>('web');
  const [locale, setLocale] = useState('en-GB');
  const [active, setActive] = useState(false);
  const [content, setContent] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(creative?.name ?? '');
    setChannel((creative?.channel as ChannelId) ?? 'web');
    setLocale(creative?.locale ?? 'en-GB');
    setActive(creative?.active ?? false);
    setContent(
      creative
        ? Object.fromEntries(
            Object.entries(creative.content)
              .filter(([k]) => k !== 'channel')
              .map(([k, v]) => [k, String(v)])
          )
        : {}
    );
  }, [open, creative]);

  const spec = CHANNELS.find((c) => c.id === channel) ?? CHANNELS[0];

  const { data: placements } = useQuery({
    queryKey: ['placements'],
    queryFn: () => apiClient.listPlacements(),
    enabled: open && spec.fields.some((f) => f.slots),
  });

  /** Slots on this channel. A hero placement is not an option for an SMS. */
  const slotOptions = (placements?.placements ?? [])
    .filter((p) => p.channel === channel && p.active)
    .map((p) => ({ id: p.key, label: p.name, type: p.type }));

  /**
   * Choosing a slot suggests the shape it renders in.
   *
   * A suggestion, not a rule: the slot and the design are separate decisions,
   * and somebody may deliberately put a tile-shaped creative in a hero while
   * they test something. It only fills an empty field, so it never overwrites a
   * choice already made.
   */
  const chooseSlot = (key: string) => {
    const slot = slotOptions.find((o) => o.id === key);
    setContent((c) => ({
      ...c,
      placement: key,
      placementType: c.placementType || (slot?.type ?? ''),
    }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const body: Partial<CreativeDto> = {
        name: name.trim(),
        channel,
        locale,
        active,
        // Only the fields this channel declares. Carrying leftovers from a
        // channel the person switched away from would store content the
        // renderer never reads and the validator never sees.
        content: {
          channel,
          ...Object.fromEntries(spec.fields.map((f) => [f.name, content[f.name] ?? ''])),
        } as CreativeDto['content'],
      };
      return creative
        ? apiClient.updateCreative(offerId, creative.id, body)
        : apiClient.createCreative(offerId, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offer', offerId] });
      queryClient.invalidateQueries({ queryKey: ['offers'] });
      // The content library reads across offers under its own key, so editing
      // from there left the row showing the line it used to say. Invalidated
      // here rather than by the page, because the dialog is what knows a write
      // happened — a caller that forgot would be a stale list nobody noticed.
      queryClient.invalidateQueries({ queryKey: ['creatives'] });
      onOpenChange(false);
    },
  });

  const problems = save.error instanceof ApiError ? save.error.problems : [];
  const problemFor = (field: string) => problems.find((p) => p.field === `content.${field}`)?.message;
  const banner =
    save.error instanceof ApiError && problems.length === 0 ? save.error.message : null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${creative?.name}` : 'Add creative'}
      description={
        editing
          ? 'Changes are delivered immediately and written to the audit log.'
          : 'Content for one channel. An offer needs at least one active creative before it can be delivered.'
      }
      submitLabel={editing ? 'Save creative' : 'Add creative'}
      busy={save.isPending}
      error={banner}
      onSubmit={() => save.mutate()}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" htmlFor="creative-name">
          <Input id="creative-name" value={name} required onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Channel" htmlFor="creative-channel" error={problemFor('channel')}>
          <Select
            id="creative-channel"
            value={channel}
            // The content shape is the channel's. Changing it after the fact
            // would leave fields that belong to neither, so it is fixed once
            // the creative exists.
            disabled={editing}
            onChange={(e) => setChannel(e.target.value as ChannelId)}
          >
            {CHANNELS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Locale" htmlFor="creative-locale">
          <Input id="creative-locale" value={locale} onChange={(e) => setLocale(e.target.value)} />
        </Field>

        <Field label="Delivery" htmlFor="creative-active" hint="Only active creatives are delivered.">
          <Select
            id="creative-active"
            value={active ? 'active' : 'inactive'}
            onChange={(e) => setActive(e.target.value === 'active')}
          >
            <option value="inactive">Not active</option>
            <option value="active">Active</option>
          </Select>
        </Field>
      </div>

      <div className="space-y-3 border-t border-border pt-3">
        {spec.fields.map((f) => {
          const id = `creative-${f.name}`;
          const error = problemFor(f.name);
          return (
            <Field
              key={f.name}
              label={f.optional ? `${f.label} (optional)` : f.label}
              htmlFor={id}
              hint={f.hint}
              error={error}
            >
              {f.slots ? (
                <Select
                  id={id}
                  value={content[f.name] ?? ''}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(e) => chooseSlot(e.target.value)}
                >
                  <option value="">Any slot</option>
                  {slotOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.options ? (
                <Select
                  id={id}
                  value={content[f.name] ?? ''}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(e) => setContent((c) => ({ ...c, [f.name]: e.target.value }))}
                >
                  <option value="">Any</option>
                  {f.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              ) : f.multiline ? (
                <textarea
                  id={id}
                  rows={f.name === 'text' ? 3 : 4}
                  value={content[f.name] ?? ''}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  placeholder={f.placeholder}
                  onChange={(e) => setContent((c) => ({ ...c, [f.name]: e.target.value }))}
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 text-body text-content placeholder:text-content-subtle focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
                />
              ) : (
                <Input
                  id={id}
                  value={content[f.name] ?? ''}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  placeholder={f.placeholder}
                  onChange={(e) => setContent((c) => ({ ...c, [f.name]: e.target.value }))}
                />
              )}
            </Field>
          );
        })}

        {channel === 'sms' ? (
          <p className="text-label text-content-subtle">
            {(content.text ?? '').length} / 160 characters
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}
