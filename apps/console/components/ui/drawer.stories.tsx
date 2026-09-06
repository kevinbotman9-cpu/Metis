import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Drawer } from './drawer';
import { Button } from './button';
import { StatusBadge } from './primitives';

/**
 * Open it and try the keyboard: Tab is trapped inside, Escape closes, and
 * focus returns to the trigger. None of that is written here — it is why the
 * drawer is a Radix Dialog rather than a positioned div.
 */
const meta: Meta<typeof Drawer> = {
  title: 'Primitives/Drawer',
  component: Drawer,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Drawer>;

function Demo({
  paging,
  title = '5G Unlimited 24mo',
  subtitle = 'upsell_5g',
}: {
  paging: boolean;
  title?: string;
  subtitle?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="min-h-[36rem] bg-page p-6">
      <Button variant="primary" onClick={() => setOpen(true)}>
        Open the drawer
      </Button>
      <Drawer
        open={open}
        onOpenChange={setOpen}
        title={title}
        subtitle={subtitle}
        headerAside={<StatusBadge status="active" />}
        onPrev={paging ? () => {} : undefined}
        onNext={paging ? () => {} : undefined}
        prevLabel={paging ? 'Data Boost +10GB' : undefined}
        nextLabel={paging ? 'Legacy 4G Bundle' : undefined}
      >
        <div className="space-y-3 p-5 text-body text-content-muted">
          <p>
            Detail arrives here without leaving the list, so a reviewer keeps their filter and
            their scroll position while walking the catalogue.
          </p>
          <p>
            Paging moves through the filtered list rather than the whole catalogue: if you have
            narrowed to the offers that cannot be delivered, next means the next one of those.
          </p>
        </div>
      </Drawer>
    </div>
  );
}

export const WithPaging: Story = {
  render: () => <Demo paging />,
  name: 'With paging',
};

/**
 * The arrows are absent rather than disabled. A control that is always there
 * and usually dead teaches people to stop looking at it.
 */
export const SingleRecord: Story = {
  render: () => <Demo paging={false} />,
  name: 'Nothing to page to',
};

export const LongTitle: Story = {
  render: () => (
    <Demo
      paging
      title="Full Fibre 900Mb with unlimited weekend data and a 24-month price promise"
      subtitle="acq_fibre_900_unlimited_weekend_promise_24"
    />
  ),
  name: 'Title and key both truncate',
};
