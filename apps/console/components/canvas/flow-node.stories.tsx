import type { ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { FlowNode, type FlowNodeData } from './flow-node';
import type { FlowNodeType } from '@/mocks/fixtures/artifacts';

const meta: Meta = {
  title: 'Canvas/FlowNode',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <Story />
      </ReactFlowProvider>
    ),
  ],
};
export default meta;

const base: FlowNodeData = {
  label: 'Eligibility',
  nodeType: 'filter',
  estimatedMs: 1.1,
  policyCount: 3,
  hasModel: false,
  selected: false,
};

// NodeProps carries React Flow internals the component never reads; only
// `data` matters, so build a minimal props object and widen it once.
function Node(props: Partial<FlowNodeData>) {
  const data: FlowNodeData = { ...base, ...props };
  const NodePreview = FlowNode as unknown as (p: { data: FlowNodeData }) => ReactElement;
  return <NodePreview data={data} />;
}

/** One of each family, so the colour coding can be checked at a glance. */
export const AllTypes: StoryObj = {
  render: () => {
    const types: { type: FlowNodeType; label: string; extra?: Partial<FlowNodeData> }[] = [
      { type: 'source', label: 'Customer profile', extra: { policyCount: 0, estimatedMs: 4.2 } },
      { type: 'filter', label: 'Eligibility' },
      { type: 'constraint', label: 'Frequency policy', extra: { policyCount: 0, estimatedMs: 0.6 } },
      {
        type: 'score-adaptive',
        label: 'Acceptance propensity',
        extra: { policyCount: 0, hasModel: true, estimatedMs: 3.1 },
      },
      { type: 'switch', label: 'Known visitor?', extra: { policyCount: 0, estimatedMs: 0.3 } },
      { type: 'explain-annotate', label: 'Explain the nudge', extra: { policyCount: 0 } },
      { type: 'arbitrate', label: 'Arbitrate', extra: { policyCount: 0, estimatedMs: 2.3 } },
    ];
    return (
      <div className="flex flex-wrap gap-4">
        {types.map((t) => (
          <Node key={t.type} nodeType={t.type} label={t.label} {...t.extra} />
        ))}
      </div>
    );
  },
};

export const Selected: StoryObj = {
  render: () => <Node selected />,
};

/** Shown when a trace is overlaid: how many candidates this node removed. */
export const WithEliminations: StoryObj = {
  render: () => <Node eliminatedHere={2} />,
};
