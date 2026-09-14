import type { Meta, StoryObj } from '@storybook/react';
import {
  EvidenceAction,
  EvidenceFields,
  EvidenceLabel,
  EvidencePick,
  EvidenceQuote,
  EvidenceRow,
  type EvidenceTone,
} from './evidence';

/**
 * Switch theme and density in the toolbar to see all four axes.
 *
 * The evidence pane of a Cascade (§4.7): what is selected, the line that names
 * it, the fields behind it, a quote, and what to do next. The quote's edge takes
 * the tone of what is selected. Every sentence in a quote here is one the record
 * beside it supports — the stories use the reason code meanings the trace reads.
 */

function Pane({ tone, withAction }: { tone: EvidenceTone; withAction: boolean }) {
  return (
    <section aria-label="Evidence" className="max-w-[19rem] rounded border border-border bg-surface p-card">
      <EvidenceLabel>pol_affordability_line</EvidenceLabel>
      <EvidencePick>Affordability on a new line</EvidencePick>
      <EvidenceQuote title="What this code means" tone={tone}>
        Affordability and ethics. Is it right for this customer?
      </EvidenceQuote>
      <EvidenceFields>
        <EvidenceRow label="Reason code">SUITABILITY_FAILED</EvidenceRow>
        <EvidenceRow label="Field it evaluated">
          <span className="font-mono">customer.bill_to_income_ratio lte 0.1</span>
        </EvidenceRow>
        <EvidenceRow label="What the customer was told">
          <span className="text-content-muted">— nothing. No customer-facing refusal text exists in the platform</span>
        </EvidenceRow>
      </EvidenceFields>
      {withAction ? (
        <EvidenceAction href="#" primary sub="The rule, its conditions and its scope">
          Open the policy
        </EvidenceAction>
      ) : null}
    </section>
  );
}

const meta: Meta<typeof Pane> = {
  title: 'UI/Evidence',
  component: Pane,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof Pane>;

export const ARuleThatRemovedSomething: Story = {
  args: { tone: 'hold', withAction: true },
  name: 'A rule that removed something',
};

export const NotAFault: Story = {
  args: { tone: 'neutral', withAction: false },
  name: 'Not a fault — beaten on priority',
};

export const TheBreak: Story = {
  args: { tone: 'block', withAction: true },
  name: 'The break',
};
