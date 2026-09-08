import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { FormRenderer } from './form-renderer';
import {
  descriptorFor,
  toFormState,
  toPayload,
  type FormState,
} from '@metis/ui-metadata';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * Every story renders the **real** Offer descriptor from the registry, so a
 * story that looks wrong is the descriptor being wrong. There is no fixture
 * form here and no hand-written field list — that is the point of the whole
 * mechanism, and a story that faked it would be testing nothing.
 *
 * The state worth looking at hardest is "Nothing chosen yet". Category is
 * disabled and offers nothing until an objective is picked, and that
 * dependency is two lines of the descriptor rather than a disabled attribute
 * somebody remembered to write.
 */

const offer = descriptorFor('Offer');

const optionSources = {
  'taxonomy.objectives': [
    { value: 'obj_acquisition', label: 'Acquisition' },
    { value: 'obj_retention', label: 'Retention' },
    { value: 'obj_service', label: 'Service' },
  ],
  'taxonomy.categories': [
    { value: 'cat_broadband', label: 'Broadband', objectiveId: 'obj_acquisition' },
    { value: 'cat_handsets', label: 'Handsets', objectiveId: 'obj_acquisition' },
    { value: 'cat_save', label: 'Save and retain', objectiveId: 'obj_retention' },
  ],
};

const existing = {
  id: 'prop_unlimited_5g_24',
  name: 'Unlimited 5G upgrade — existing handset',
  key: 'unlimited_5g_24',
  description: 'Unlimited data on 5G for customers keeping their current device.',
  objectiveId: 'obj_acquisition',
  categoryId: 'cat_broadband',
  boost: 1.15,
  tags: ['5g', 'hero', 'q3'],
  financials: {
    price: { amount: 3500, currency: 'GBP' },
    cost: { amount: 1180, currency: 'GBP' },
    expectedMargin: { amount: 2320, currency: 'GBP' },
    termMonths: 24,
    oneOff: false,
  },
};

/**
 * Stateful wrapper. The renderer is controlled, so a story that passed a
 * frozen object could not show the objective/category dependency working.
 */
function Harness({
  initial,
  editing = false,
  permissions = [],
  problems = {},
}: {
  initial: FormState;
  editing?: boolean;
  permissions?: string[];
  problems?: Record<string, string>;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [touched, setTouched] = useState<ReadonlySet<string>>(
    editing ? new Set(offer.fields.map((f) => f.field)) : new Set()
  );

  return (
    <div className="max-w-2xl space-y-3 rounded-lg border border-border bg-surface p-card">
      <FormRenderer
        descriptor={offer}
        form={form}
        onChange={setForm}
        editing={editing}
        permissions={permissions}
        optionSources={optionSources}
        problems={problems}
        touched={touched}
        onTouch={(field) => setTouched((t) => new Set(t).add(field))}
      />
      <details className="border-t border-border pt-2">
        <summary className="cursor-pointer text-label text-content-subtle">
          What this would send
        </summary>
        <pre className="mt-1 overflow-x-auto rounded bg-surface-sunken p-2 font-mono text-label text-content-muted">
          {JSON.stringify(toPayload(offer, form, { editing, permissions, entity: existing }), null, 2)}
        </pre>
      </details>
    </div>
  );
}

const meta: Meta<typeof Harness> = {
  title: 'Forms/FormRenderer',
  component: Harness,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof Harness>;

export const NewOffer: Story = {
  args: { initial: toFormState(offer) },
  name: 'New offer — nothing chosen yet',
};

export const KeySuggested: Story = {
  args: {
    initial: { ...toFormState(offer), name: 'Speed Boost 100Mb', key: 'speed_boost_100mb' },
  },
  name: 'Key suggested from the name, until someone edits it',
};

export const ObjectiveChosen: Story = {
  args: {
    initial: { ...toFormState(offer), objectiveId: 'obj_acquisition' },
  },
  name: 'Objective chosen — category now offers only that objective’s',
};

export const EditingExisting: Story = {
  args: { initial: toFormState(offer, existing), editing: true },
  name: 'Editing — the key is locked for the life of the offer',
};

export const ServerRefused: Story = {
  args: {
    initial: { ...toFormState(offer, existing), key: 'unlimited_5g_24' },
    problems: {
      key: 'An offer already uses the key ‘unlimited_5g_24’.',
      'financials.expectedMargin': 'Margin cannot exceed price minus cost.',
    },
  },
  name: 'Server refusals, on the fields they are about',
};

/**
 * A descriptor can gate a field on a permission. Nothing in the Offer
 * descriptor uses one today, so this story renders a copy that does — it is
 * the state a reviewer needs to see before relying on the feature.
 */
/**
 * Creative is the harder case, and the reason `visibleWhen` exists.
 *
 * Five content shapes on one entity. Switch the channel in the rendered form
 * and the fields below it change — that is two lines per field in the
 * descriptor, where the hand-built version carried a table of field specs and
 * a lookup. Open "What this would send" and switch channel: the payload only
 * ever contains the channel on screen, so a subject typed on Email cannot
 * follow you to SMS.
 */
const creative = descriptorFor('Creative');

const placementSources = {
  placements: [
    { value: 'homepage_hero', label: 'Homepage hero', channel: 'web', type: 'hero' },
    { value: 'plans_tile', label: 'Plans tile', channel: 'web', type: 'tile' },
    { value: 'inbox_promo', label: 'Inbox promo', channel: 'email', type: 'feature_band' },
  ],
};

function CreativeHarness({ initial, editing = false }: { initial: FormState; editing?: boolean }) {
  const [form, setForm] = useState<FormState>(initial);
  const [touched, setTouched] = useState<ReadonlySet<string>>(
    editing ? new Set(creative.fields.map((f) => f.field)) : new Set()
  );

  return (
    <div className="max-w-2xl space-y-3 rounded-lg border border-border bg-surface p-card">
      <FormRenderer
        descriptor={creative}
        form={form}
        onChange={setForm}
        editing={editing}
        permissions={[]}
        optionSources={placementSources}
        touched={touched}
        onTouch={(field) => setTouched((t) => new Set(t).add(field))}
        idPrefix="creative"
      />
      <details className="border-t border-border pt-2">
        <summary className="cursor-pointer text-label text-content-subtle">
          What this would send
        </summary>
        <pre className="mt-1 overflow-x-auto rounded bg-surface-sunken p-2 font-mono text-label text-content-muted">
          {JSON.stringify(toPayload(creative, form, { editing, permissions: [] }), null, 2)}
        </pre>
      </details>
    </div>
  );
}

export const CreativeWeb: Story = {
  render: () => (
    <CreativeHarness initial={{ ...toFormState(creative), channel: 'web', locale: 'en-GB' }} />
  ),
  name: 'Creative on web — slot and shape, the widest channel',
};

export const CreativeSms: Story = {
  render: () => (
    <CreativeHarness
      initial={{
        ...toFormState(creative),
        name: 'Winback — SMS',
        channel: 'sms',
        locale: 'en-GB',
        'content.text': 'Come back to unlimited 5G for £20/mo. Reply STOP to opt out.',
        'content.senderId': 'TELCO',
      }}
    />
  ),
  name: 'Creative on SMS — two fields, and none of email’s',
};

export const CreativeChannelLocked: Story = {
  render: () => (
    <CreativeHarness
      editing
      initial={{
        ...toFormState(creative),
        name: 'Homepage hero — 5G',
        channel: 'web',
        locale: 'en-GB',
        active: 'true',
        'content.headline': 'Unlimited 5G, £35/mo',
        'content.placement': 'homepage_hero',
        'content.placementType': 'hero',
      }}
    />
  ),
  name: 'Editing — the channel is locked, because the content shape is its',
};

export const PermissionGated: Story = {
  render: () => {
    const gated = {
      ...offer,
      fields: offer.fields.map((f) =>
        f.field === 'boost' ? { ...f, permission: 'edit:arbitration' } : f
      ),
    };
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: 'Without edit:arbitration', permissions: [] as string[] },
          { label: 'With edit:arbitration', permissions: ['edit:arbitration'] },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-surface p-card">
            <p className="mb-2 text-label font-medium text-content-subtle">{c.label}</p>
            <FormRenderer
              descriptor={gated}
              form={toFormState(gated, existing)}
              onChange={() => {}}
              editing
              permissions={c.permissions}
              optionSources={optionSources}
              touched={new Set()}
              onTouch={() => {}}
              idPrefix={c.permissions.length ? 'with' : 'without'}
            />
          </div>
        ))}
      </div>
    );
  },
  name: 'A permission-gated field, hidden rather than disabled',
};
