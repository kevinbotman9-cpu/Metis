import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FormDialog } from './form-dialog';
import { Field, Input, Select } from './primitives';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The states worth looking at are the two failure ones. `Refused, per field`
 * is how a validation response should read — each reason against the input it
 * is about, so nobody hunts. `Refused, whole write` is for the refusal that
 * belongs to no single field: a permission, a conflict, a duplicate key.
 *
 * A dialog that is open in every story on purpose: a closed one renders
 * nothing, and Radix portals the open one, so `layout: fullscreen` is what
 * keeps the backdrop honest.
 */
const meta: Meta<typeof FormDialog> = {
  title: 'Forms/FormDialog',
  component: FormDialog,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof FormDialog>;

/** Keeps the dialog open in Storybook without disabling its own close paths. */
function Harness(props: Partial<React.ComponentProps<typeof FormDialog>>) {
  const [open, setOpen] = useState(true);
  return (
    <div className="min-h-[28rem] bg-canvas p-6">
      <button className="text-body text-accent underline" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <FormDialog
        open={open}
        onOpenChange={setOpen}
        title="New offer"
        description="A new offer starts as a draft. It can go active once it has a creative."
        submitLabel="Create offer"
        onSubmit={() => setOpen(false)}
        {...props}
      >
        <Field label="Name" htmlFor="s-name">
          <Input id="s-name" defaultValue="Speed Boost 100Mb" />
        </Field>
        <Field
          label="Key"
          htmlFor="s-key"
          hint="The action a decision names. Stable for the life of the offer."
        >
          <Input id="s-key" defaultValue="speed_boost_100mb" />
        </Field>
        <Field label="Objective" htmlFor="s-objective">
          <Select id="s-objective" defaultValue="growth">
            <option value="growth">Growth</option>
            <option value="retention">Retention</option>
          </Select>
        </Field>
      </FormDialog>
    </div>
  );
}

export const Default: Story = {
  render: () => <Harness />,
  name: 'Ready to submit',
};

export const Busy: Story = {
  render: () => <Harness busy />,
  name: 'Saving',
};

export const RefusedWholeWrite: Story = {
  render: () => <Harness error="An offer already uses the key 'speed_boost_100mb'." />,
  name: 'Refused, whole write',
};

export const RefusedPerField: Story = {
  render: () => (
    <div className="min-h-[28rem] bg-canvas p-6">
      <FormDialog
        open
        onOpenChange={() => {}}
        title="Add creative"
        description="Content for one channel."
        submitLabel="Add creative"
        onSubmit={() => {}}
      >
        <Field label="Name" htmlFor="s2-name">
          <Input id="s2-name" defaultValue="Speed Boost — SMS" />
        </Field>
        <Field
          label="Message"
          htmlFor="s2-text"
          error="SMS is 200 characters; the limit is 160. Longer messages are split and billed per segment."
        >
          <Input id="s2-text" defaultValue={'x'.repeat(40) + '…'} aria-invalid />
        </Field>
        <Field
          label="Sender id"
          htmlFor="s2-sender"
          error="Sender id is 18 characters; carriers allow 11."
        >
          <Input id="s2-sender" defaultValue="MeridianMobileLong" aria-invalid />
        </Field>
      </FormDialog>
    </div>
  ),
  name: 'Refused, per field',
};
