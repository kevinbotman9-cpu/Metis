import type { Meta, StoryObj } from '@storybook/react';
import {
  Badge,
  StatusBadge,
  AutonomyBadge,
  Card,
  CardHeader,
  CardBody,
  Metric,
  Input,
  Select,
  Field,
  LoadingState,
  EmptyState,
  ErrorState,
  PermissionDenied,
} from './primitives';
import { Button } from './button';

const meta: Meta = {
  title: 'Primitives/Overview',
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj;

/** Every tone side by side — the quickest way to spot a contrast regression. */
export const Badges: Story = {
  render: () => (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-label uppercase tracking-wide text-content-subtle">Tones</p>
        <div className="flex flex-wrap gap-2">
          {(['neutral', 'accent', 'pass', 'block', 'hold', 'info', 'outline'] as const).map(
            (tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            )
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-label uppercase tracking-wide text-content-subtle">
          Proposition status
        </p>
        <div className="flex flex-wrap gap-2">
          {['active', 'draft', 'paused', 'retired'].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-label uppercase tracking-wide text-content-subtle">
          Autonomy ladder
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            ['L0', 'Observe'],
            ['L1', 'Assist'],
            ['L2', 'Propose'],
            ['L3', 'Bounded'],
            ['L4', 'Autonomous'],
          ].map(([level, name]) => (
            <AutonomyBadge key={level} level={level} name={name} />
          ))}
        </div>
      </div>
    </div>
  ),
};

export const Buttons: Story = {
  render: () => (
    <div className="space-y-4">
      {(['sm', 'md', 'lg'] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-2">
          <span className="w-8 text-label text-content-subtle">{size}</span>
          {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
            <Button key={variant} variant={variant} size={size}>
              {variant}
            </Button>
          ))}
          <Button variant="primary" size={size} disabled>
            disabled
          </Button>
        </div>
      ))}
    </div>
  ),
};

export const Metrics: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Metric label="Propositions" value={11} sub="across 4 issues" />
      <Metric label="Active" value={8} tone="pass" />
      <Metric label="Draft or paused" value={2} tone="hold" />
      <Metric label="Missing treatments" value={1} tone="block" sub="cannot be delivered" />
      <Metric label="Avg latency" value="9.9ms" tone="accent" sub="SLA 50ms" />
    </div>
  ),
};

export const FormControls: Story = {
  render: () => (
    <div className="grid max-w-lg gap-3">
      <Field label="Customer ID" htmlFor="sb-cust" hint="Partial matches are fine.">
        <Input id="sb-cust" placeholder="cust_…" />
      </Field>
      <Field label="Channel" htmlFor="sb-chan">
        <Select id="sb-chan" defaultValue="">
          <option value="">All channels</option>
          <option value="web">Web</option>
          <option value="email">Email</option>
        </Select>
      </Field>
      <Field label="Disabled" htmlFor="sb-dis">
        <Input id="sb-dis" disabled defaultValue="Read only" />
      </Field>
    </div>
  ),
};

/** Every data surface must be able to render each of these. */
export const States: Story = {
  render: () => (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Loading" />
        <LoadingState label="Loading decisions" />
      </Card>
      <Card>
        <CardHeader title="Empty" />
        <EmptyState
          title="No decisions match these filters"
          description="Widen the date range or clear a filter."
          action={<Button variant="primary">Reset filters</Button>}
        />
      </Card>
      <Card>
        <CardHeader title="Error" />
        <ErrorState
          description="The execution plane did not respond."
          onRetry={() => {}}
        />
      </Card>
      <Card>
        <CardHeader title="Permission denied" />
        <PermissionDenied permission="view:audit" />
      </Card>
    </div>
  ),
};

export const CardLayout: Story = {
  render: () => (
    <Card>
      <CardHeader
        title="Decision metadata"
        description="What governed this decision."
        actions={<Button size="sm">Export</Button>}
      />
      <CardBody>
        <p className="text-body text-content-muted">
          Card body content sits on the surface token, so it inverts cleanly in dark mode.
        </p>
      </CardBody>
    </Card>
  ),
};
