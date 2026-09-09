'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RequireAuth } from '@/components/require-auth';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  Badge,
  Metric,
  EmptyState,
  ErrorState,
  LoadingState,
  Input,
  Select,
} from '@/components/ui/primitives';
import {
  apiClient,
  type SchemaEntityDto,
  type SchemaFieldDto,
  type SchemaFieldPathDto,
} from '@/lib/api-client';

/**
 * The data model.
 *
 * `PolicyCondition.field` was documented as "a dotted path into the customer
 * data model" while no such model existed — only a string, and a check that
 * validated the root segment because a root is all a connector can supply. So
 * `address.fibre_availabl` was as valid as `address.fibre_available`, and a
 * typo did not error: it decided, and the trace explained the wrong answer with
 * a confident reason code.
 *
 * This page is the model made visible. Two views, because two different people
 * need it: **entities** for whoever is modelling the tenant's data, and
 * **paths** for whoever is about to write a rule and needs to know what they
 * can reference.
 */

const TYPE_TONE: Record<string, 'neutral' | 'accent' | 'pass' | 'hold'> = {
  integer: 'accent',
  decimal: 'accent',
  money: 'accent',
  timestamp: 'accent',
  boolean: 'pass',
  enum: 'hold',
  string: 'neutral',
};

/** Personal data is marked because retention needs to know, not for decoration. */
function Sensitivity({ level }: { level?: string }) {
  if (!level || level === 'none') return null;
  return (
    <Badge tone={level === 'special_category' ? 'block' : 'hold'}>
      {level === 'special_category' ? 'special category' : 'personal'}
    </Badge>
  );
}

function FieldRow({ field }: { field: SchemaFieldDto }) {
  return (
    <div className="flex items-baseline gap-2 py-1">
      <span className="font-mono text-label text-content">{field.name}</span>
      <Badge tone={TYPE_TONE[field.type] ?? 'neutral'}>{field.type}</Badge>
      {field.unit ? <span className="text-label text-content-muted">{field.unit}</span> : null}
      {field.required ? <Badge tone="neutral">required</Badge> : null}
      <Sensitivity level={field.sensitivity} />
      <span className="min-w-0 flex-1 truncate text-label text-content-muted">
        {field.description}
      </span>
      {field.members?.length ? (
        <span className="shrink-0 font-mono text-[0.6875rem] text-content-subtle">
          {field.members.join(' · ')}
        </span>
      ) : null}
    </div>
  );
}

function EntityCard({ entity, root }: { entity: SchemaEntityDto; root: boolean }) {
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {entity.name}
            {root ? <Badge tone="accent">root</Badge> : null}
          </span>
        }
        description={entity.description}
      />
      <div className="space-y-2 px-card py-3">
        <div className="divide-y divide-border">
          {entity.fields.length === 0 ? (
            <p className="text-label text-content-muted">No fields.</p>
          ) : (
            entity.fields.map((f) => <FieldRow key={f.name} field={f} />)
          )}
        </div>

        {entity.relationships?.length ? (
          <div className="border-t border-border pt-2">
            <div className="text-label font-medium text-content-subtle">Relationships</div>
            {entity.relationships.map((r) => (
              <div key={r.name} className="flex items-baseline gap-2 py-1">
                <span className="font-mono text-label text-content">{r.name}</span>
                <Badge tone={r.cardinality === 'many' ? 'hold' : 'neutral'}>
                  {r.cardinality === 'many' ? 'has many' : 'has one'}
                </Badge>
                <span className="font-mono text-label text-accent">{r.entity}</span>
                <span className="min-w-0 flex-1 truncate text-label text-content-muted">
                  {r.description}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function DataModelView() {
  const [view, setView] = useState<'entities' | 'paths'>('entities');
  const [q, setQ] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['profile-schema'],
    queryFn: () => apiClient.getProfileSchema(),
  });

  if (isLoading) return <LoadingState label="Loading the data model" />;
  if (error || !data) {
    return (
      <ErrorState
        description="Could not load the data model."
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const { schema, paths, problems = [] } = data;
  const needle = q.trim().toLowerCase();

  const matches = (p: SchemaFieldPathDto) =>
    !needle ||
    p.path.toLowerCase().includes(needle) ||
    p.description.toLowerCase().includes(needle);

  const shown = paths.filter(matches);
  const manyRelationships = schema.entities.flatMap((e) =>
    (e.relationships ?? []).filter((r) => r.cardinality === 'many')
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Entities" value={String(schema.entities.length)} />
        <Metric label="Selectable paths" value={String(paths.length)} />
        <Metric label="Rollups" value={String(schema.aggregations.length)} />
        <Metric
          label="Model problems"
          value={String(problems.length)}
          tone={problems.length > 0 ? 'block' : 'pass'}
        />
      </div>

      {problems.length > 0 ? (
        <Card>
          <CardHeader
            title="The model does not hold together"
            description="A schema that names an entity it does not define, or aggregates over a relationship that holds one object, produces confident nonsense downstream."
          />
          <ul className="space-y-1 px-card py-3">
            {problems.map((p) => (
              <li key={p} className="text-body text-block">
                {p}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={view === 'entities' ? 'Entities' : 'What a policy can reference'}
          description={
            view === 'entities'
              ? `Version ${schema.version}. The root entity is what a decision request carries; the rest hang off it.`
              : 'Every path a targeting policy may name. A field not on this list cannot be authored, and no longer compiles.'
          }
          actions={
            <div className="flex items-center gap-2">
              {view === 'paths' ? (
                <Input
                  aria-label="Search paths"
                  placeholder="e.g. arrears"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              ) : null}
              <Select
                aria-label="View"
                value={view}
                onChange={(e) => setView(e.target.value as typeof view)}
              >
                <option value="entities">Entities</option>
                <option value="paths">Paths</option>
              </Select>
            </div>
          }
        />

        {view === 'paths' ? (
          shown.length === 0 ? (
            <EmptyState
              title="No path matches"
              description={`Nothing in the model matches "${q}".`}
            />
          ) : (
            <div className="divide-y divide-border">
              {shown.map((p) => (
                <div key={p.path} className="flex items-baseline gap-2 px-card py-1.5">
                  <span className="font-mono text-label text-content">{p.path}</span>
                  <Badge tone={TYPE_TONE[p.type] ?? 'neutral'}>{p.type}</Badge>
                  {p.kind === 'aggregation' ? <Badge tone="accent">rollup</Badge> : null}
                  {p.unit ? (
                    <span className="text-label text-content-muted">{p.unit}</span>
                  ) : null}
                  <Sensitivity level={p.sensitivity} />
                  <span className="min-w-0 flex-1 truncate text-label text-content-muted">
                    {p.description}
                  </span>
                  <span className="shrink-0 font-mono text-[0.6875rem] text-content-subtle">
                    {p.operators.slice(0, 4).join(' ')}
                    {p.operators.length > 4 ? ' …' : ''}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-3 px-card py-3">
            {schema.entities.map((e) => (
              <EntityCard key={e.name} entity={e} root={e.name === schema.root} />
            ))}
          </div>
        )}
      </Card>

      {schema.aggregations.length > 0 ? (
        <Card>
          <CardHeader
            title="Rollups over child records"
            description="The engine never walks a relationship — reading a live graph inside a decision would end replay. These are computed before it runs and enter the decision as ordinary numbers, so the value a decision saw is part of what was decided."
          />
          <div className="divide-y divide-border">
            {schema.aggregations.map((a) => (
              <div key={a.produces} className="px-card py-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-label text-content">{a.produces}</span>
                  <Badge tone={TYPE_TONE[a.type] ?? 'neutral'}>{a.type}</Badge>
                  <span className="font-mono text-label text-content-subtle">
                    {a.fn}
                    {a.field ? `(${a.field})` : '()'} over {a.over.join('.')}
                  </span>
                </div>
                <p className="mt-0.5 text-label text-content-muted">{a.description}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {manyRelationships.length > 0 ? (
        <p className="text-label text-content-muted">
          {manyRelationships.length} one-to-many relationship
          {manyRelationships.length === 1 ? '' : 's'} declared. A policy cannot read through one
          directly — there is no single value to compare — which is what a rollup is for.
        </p>
      ) : null}
    </div>
  );
}

export default function DataModelPage() {
  return (
    <RequireAuth>
      <PageHeader
        title="Data model"
        description="What a decision can read about a customer, and what a targeting policy may reference. Declared here; enforced by the compiler."
      />
      <PageBody>
        <DataModelView />
      </PageBody>
    </RequireAuth>
  );
}
