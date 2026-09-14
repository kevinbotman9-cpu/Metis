import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { CascadePanes } from './cascade-panes';
import { CascadeRail, type CascadeStage } from './cascade-rail';
import { Card, CardBody, CardHeader } from './ui/primitives';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The three panes of a Cascade as one object: the rail in the frame colour
 * running the full height, the selected stage on the page, and the evidence on
 * a surface. Compare **Short rail, long middle** — the rail used to be a card
 * that stopped where its content did.
 */

const stages: CascadeStage[] = [
  { id: 'decisions', label: 'Decisions made', value: 10_401, pct: 100, note: '5 channels' },
  { id: 'offered', label: 'Offered something', value: 3426, pct: 33, note: '33% of decisions', tone: 'accent' },
  {
    id: 'deliverable',
    label: 'Deliverable',
    value: 739,
    pct: 7.1,
    note: '22% of offered',
    broken: '2,687 decisions won a slot on a channel nothing delivers.',
  },
  { id: 'seen', label: 'Seen', value: 416, pct: 4, note: '56.3% of deliverable', tone: 'attention' },
  { id: 'acted', label: 'Acted on', value: 79, pct: 0.8, note: '19.0% of seen', tone: 'ok' },
];

function Panes({ middleCards, wide }: { middleCards: number; wide?: boolean }) {
  const [selected, setSelected] = useState<string | null>('deliverable');
  return (
    <CascadePanes
      wide={wide}
      rail={
        <CascadeRail
          label="The loop"
          stages={stages}
          selected={selected}
          onSelect={setSelected}
          foot={
            <>
              The loop is <strong className="font-semibold text-content">closed on Web only</strong> and open on 4.
            </>
          }
        />
      }
      evidence={
        <>
          <h2 className="text-label font-semibold text-content-subtle">Deliverable</h2>
          <p className="mt-1 text-body font-semibold text-content">739 · 22% of offered</p>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {Array.from({ length: middleCards }, (_, i) => (
          <Card key={i}>
            <CardHeader title={`Middle card ${i + 1}`} />
            <CardBody>
              <p className="text-body text-content-muted">The selected stage, or the whole before a stage is chosen.</p>
            </CardBody>
          </Card>
        ))}
      </div>
    </CascadePanes>
  );
}

const meta: Meta<typeof Panes> = {
  title: 'Insights/CascadePanes',
  component: Panes,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof Panes>;

export const ShortRailLongMiddle: Story = {
  args: { middleCards: 6 },
  name: 'Short rail, long middle — the rail runs the full height',
};

export const TallRail: Story = {
  args: { middleCards: 1 },
  name: 'Tall rail, short middle',
};

export const WideEvidence: Story = {
  args: { middleCards: 2, wide: true },
  name: 'Wide evidence — the trace',
};
