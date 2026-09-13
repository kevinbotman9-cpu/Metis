import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { DeleteDialog } from './delete-dialog';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * Confirming a delete in the words the entity's descriptor declares. **Refused**
 * is the one that matters: the platform's sentence, shown as it is, saying what
 * still depends on the record and what to do instead.
 */

type Policy = { id: string; name: string };
const POLICY: Policy = { id: 'pol_5g_bandwidth_need', name: 'Heavy data user' };

function Host({ outcome }: { outcome: 'deleted' | 'refused' | 'slow' }) {
  const [client] = useState(() => new QueryClient());
  const [open, setOpen] = useState(true);
  const remove = async () => {
    if (outcome === 'refused') {
      throw new ApiError(
        409,
        'conflict',
        "'Heavy data user' applies to '5G Home Ultimate', so deleting it would change who that offer reaches. Deactivate it instead: it is stored and stops applying.",
        []
      );
    }
    await new Promise((resolve) => setTimeout(resolve, outcome === 'slow' ? 60_000 : 300));
  };
  return (
    <QueryClientProvider client={client}>
      <div className="p-card">
        <Button onClick={() => setOpen(true)}>Delete policy</Button>
        <DeleteDialog<Policy>
          open={open}
          onOpenChange={setOpen}
          entity="TargetingPolicy"
          record={POLICY}
          name={POLICY.name}
          remove={remove}
        />
      </div>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof Host> = { title: 'Dialogs/DeleteDialog', component: Host, parameters: { layout: 'fullscreen' } };
export default meta;
type Story = StoryObj<typeof Host>;

export const Confirming: Story = { args: { outcome: 'deleted' } };

/** Press Delete policy: the refusal is shown, and the dialog stays open. */
export const Refused: Story = { args: { outcome: 'refused' } };

/** Press Delete policy: the button says what it is doing while it does it. */
export const Deleting: Story = { args: { outcome: 'slow' } };
