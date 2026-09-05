'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { cn } from '@/lib/cn';
import type { FlowNodeType } from '@/mocks/fixtures/artifacts';

export interface FlowNodeData {
  label: string;
  nodeType: FlowNodeType;
  estimatedMs: number;
  policyCount: number;
  hasModel: boolean;
  selected: boolean;
  /** Highlighted because a trace shows this node removed candidates. */
  eliminatedHere?: number;
}

/**
 * Node families share a colour so the graph reads at a glance:
 * data in, gates, scoring, and the terminal decision.
 */
const FAMILY: Record<FlowNodeType, { tone: string; family: string }> = {
  source: { tone: 'info', family: 'Data' },
  filter: { tone: 'accent', family: 'Gate' },
  constraint: { tone: 'hold', family: 'Gate' },
  'score-model': { tone: 'pass', family: 'Score' },
  'score-adaptive': { tone: 'pass', family: 'Score' },
  'set-property': { tone: 'info', family: 'Data' },
  switch: { tone: 'accent', family: 'Branch' },
  'sub-flow': { tone: 'accent', family: 'Branch' },
  'champion-challenger': { tone: 'accent', family: 'Branch' },
  'explain-annotate': { tone: 'info', family: 'Output' },
  arbitrate: { tone: 'block', family: 'Decision' },
};

const TONE_CLASS: Record<string, string> = {
  info: 'border-info/50 bg-info-subtle',
  accent: 'border-accent/50 bg-accent-subtle',
  hold: 'border-hold/50 bg-hold-subtle',
  pass: 'border-pass/50 bg-pass-subtle',
  block: 'border-block/50 bg-block-subtle',
};

const TONE_TEXT: Record<string, string> = {
  info: 'text-info',
  accent: 'text-accent',
  hold: 'text-hold',
  pass: 'text-pass',
  block: 'text-block',
};

function FlowNodeComponent({ data }: NodeProps<FlowNodeData>) {
  const { tone, family } = FAMILY[data.nodeType] ?? FAMILY.source;

  return (
    <div
      className={cn(
        'w-52 rounded-lg border-2 px-3 py-2 shadow-sm transition-shadow',
        TONE_CLASS[tone],
        data.selected && 'ring-2 ring-accent ring-offset-2 ring-offset-page'
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-2 !border-border !bg-surface"
      />

      <div className="flex items-center justify-between gap-2">
        <span className={cn('text-[0.625rem] font-semibold uppercase tracking-wide', TONE_TEXT[tone])}>
          {family}
        </span>
        <span className="tnum text-[0.625rem] text-content-muted">
          {data.estimatedMs.toFixed(1)}ms
        </span>
      </div>

      <p className="mt-0.5 text-body font-medium leading-tight text-content">{data.label}</p>
      <p className="mt-0.5 font-mono text-[0.625rem] text-content-subtle">{data.nodeType}</p>

      {(data.policyCount > 0 || data.hasModel || data.eliminatedHere) && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {data.policyCount > 0 && (
            <span className="rounded-sm bg-surface px-1 py-0.5 text-[0.625rem] text-content-muted">
              {data.policyCount} {data.policyCount === 1 ? 'policy' : 'policies'}
            </span>
          )}
          {data.hasModel && (
            <span className="rounded-sm bg-surface px-1 py-0.5 text-[0.625rem] text-content-muted">
              pinned model
            </span>
          )}
          {data.eliminatedHere ? (
            <span className="rounded-sm bg-block px-1 py-0.5 text-[0.625rem] font-medium text-on-block">
              −{data.eliminatedHere}
            </span>
          ) : null}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-2 !border-border !bg-surface"
      />
    </div>
  );
}

export const FlowNode = memo(FlowNodeComponent);
