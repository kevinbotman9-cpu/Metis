'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormDialog } from '@/components/ui/form-dialog';
import { Field, Input, Select } from '@/components/ui/primitives';
import { apiClient, ApiError, type CreativeDto } from '@/lib/api-client';

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
  /** Shown in the input when empty. Never a default value. */
  placeholder?: string;
}

const CHANNELS: { id: ChannelId; label: string; fields: FieldSpec[] }[] = [
  {
    id: 'email',
    label: 'Email',
    fields: [
      { name: 'subject', label: 'Subject' },
      { name: 'preheader', label: 'Preheader', hint: 'The line inboxes show after the subject.' },
      { name: 'body', label: 'Body', multiline: true },
      { name: 'fromName', label: 'From name' },
      { name: 'fromAddress', label: 'From address', placeholder: 'offers@example.com' },
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
      { name: 'subheadline', label: 'Subheadline' },
      {
        name: 'imageUrl',
        label: 'Image reference',
        hint: 'A path or URL. Nothing here stores or serves the file — see W-015.',
        placeholder: '/assets/offers/example.jpg',
      },
      { name: 'ctaLabel', label: 'Call to action' },
      { name: 'ctaUrl', label: 'Call to action link', placeholder: '/plans/example' },
      { name: 'placement', label: 'Placement', hint: 'The slot this can fill.' },
    ],
  },
  {
    id: 'push',
    label: 'Push',
    fields: [
      { name: 'title', label: 'Title' },
      { name: 'body', label: 'Body', multiline: true },
      { name: 'deeplink', label: 'Deeplink', placeholder: 'app://addons/example' },
    ],
  },
  {
    id: 'outbound_call',
    label: 'Outbound call',
    fields: [
      { name: 'script', label: 'Script', multiline: true },
      { name: 'objectionHandling', label: 'Objection handling', multiline: true },
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
            <Field key={f.name} label={f.label} htmlFor={id} hint={f.hint} error={error}>
              {f.multiline ? (
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
