import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { FlowCanvas } from './flow-canvas';
import { artifacts } from '@/mocks/fixtures/artifacts';
import type { FlowVolumeReportDto } from '@/lib/api-client';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The canvas carrying traffic (`METIS_CONSOLE_SPEC.md` §4.2). **Plain** is the
 * graph as authored. **Volume overlay** draws each edge as thick as the
 * candidates that crossed it and puts what each node removed on the node, with
 * the geometry the loop diagram uses — so the thickest edge here and the tallest
 * column on `/performance` are the same arithmetic.
 *
 * The volumes are stated here, not computed: the story shows what the canvas
 * draws for a report, and `tests/unit/flow-volume-route.test.ts` holds the
 * report to the decisions.
 */

const flow = artifacts.find((a) => a.id === 'next-best-action')!;

/** A report shaped like the route's, falling by a third at each node. */
const volume: Pick<FlowVolumeReportDto, 'nodes' | 'edges'> = (() => {
  let running = 12_000;
  const nodes = flow.nodes.map((n) => {
    const entered = running;
    const removed = n.type === 'filter' || n.type === 'constraint' ? Math.round(entered / 3) : 0;
    running = entered - removed;
    return { nodeId: n.id, type: n.type, label: n.label, entered, removed, survived: running };
  });
  const survived = new Map(nodes.map((n) => [n.nodeId, n.survived]));
  const edges = flow.edges.map((e) => ({ from: e.source, to: e.target, volume: survived.get(e.source) ?? 0 }));
  return { nodes, edges };
})();

function Canvas({ overlay }: { overlay: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    // React Flow needs an explicit height.
    <div className="h-[460px] w-full rounded border border-border bg-page">
      <FlowCanvas
        nodes={flow.nodes}
        edges={flow.edges}
        selectedId={selected}
        onSelect={setSelected}
        volume={overlay ? volume : null}
      />
    </div>
  );
}

const meta: Meta<typeof Canvas> = {
  title: 'Canvas/FlowCanvas',
  component: Canvas,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof Canvas>;

export const Plain: Story = {
  args: { overlay: false },
  name: 'Plain — the graph as authored',
};

export const VolumeOverlay: Story = {
  args: { overlay: true },
  name: 'Volume overlay — edges as thick as what crossed them',
};
