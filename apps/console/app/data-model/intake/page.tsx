'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  Field,
} from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { FormDialog } from '@/components/ui/form-dialog';
import { useAuth } from '@/components/auth-provider';
import {
  apiClient,
  ApiError,
  type DataSourceDto,
  type FieldMappingDto,
  type ValidationReportDto,
  type SchemaFieldPathDto,
} from '@/lib/api-client';

/**
 * Intake — land, map, validate, activate.
 *
 * Four stages because a source is another system's schema: it changes without
 * asking, and rules written directly against it break when it does. Every
 * platform that does this well splits landing from mapping for the same reason
 * — Adobe maps sources onto XDM, Salesforce maps a lake object onto a model
 * object, Pega runs a data flow into the analytic record.
 *
 * The stages are rendered as a pipeline rather than a form because their order
 * is the point. Activation is refused until a validation over the rows actually
 * held came back clean, and landing new rows sends the source back to draft:
 * rows that arrived after a verdict were not the rows the verdict was about.
 */

const STAGES = ['Land', 'Map', 'Validate', 'Activate'] as const;

const STATUS_TONE: Record<DataSourceDto['status'], 'neutral' | 'hold' | 'pass'> = {
  draft: 'neutral',
  validated: 'hold',
  active: 'pass',
};

/** How far a source has got, so the pipeline can show it rather than describe it. */
function stageOf(source: DataSourceDto): number {
  if (source.status === 'active') return 4;
  if (source.status === 'validated') return 3;
  if (source.mappings.length > 0) return 2;
  if (source.landedRows > 0) return 1;
  return 0;
}

function Pipeline({ source }: { source: DataSourceDto }) {
  const reached = stageOf(source);
  return (
    <ol className="flex flex-wrap items-center gap-1" aria-label="Progress">
      {STAGES.map((stage, i) => (
        <li key={stage} className="flex items-center gap-1">
          <span
            className={
              i < reached
                ? 'rounded bg-pass-subtle px-1.5 py-0.5 text-label font-medium text-pass'
                : 'rounded bg-surface-sunken px-1.5 py-0.5 text-label text-content-muted'
            }
          >
            {stage}
          </span>
          {i < STAGES.length - 1 ? (
            <span aria-hidden className="text-content-muted">
              →
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function MappingRow({
  mapping,
  columns,
  paths,
  onChange,
  onRemove,
  index,
}: {
  mapping: FieldMappingDto;
  columns: string[];
  paths: SchemaFieldPathDto[];
  onChange: (patch: Partial<FieldMappingDto>) => void;
  onRemove: () => void;
  index: number;
}) {
  const transform = mapping.transform?.kind ?? 'none';
  return (
    <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-surface-sunken p-2">
      <Select
        aria-label={`Column for mapping ${index + 1}`}
        value={mapping.column}
        onChange={(e) => onChange({ column: e.target.value })}
        className="min-w-[10rem]"
      >
        <option value="">Column…</option>
        {columns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </Select>

      <span aria-hidden className="text-content-muted">
        →
      </span>

      {/* The same picker the policy editor uses, for the same reason: a path
          the model does not have is unrepresentable rather than caught later. */}
      <Select
        aria-label={`Model path for mapping ${index + 1}`}
        value={mapping.path}
        onChange={(e) => onChange({ path: e.target.value })}
        className="min-w-[14rem]"
      >
        <option value="">Model field…</option>
        {paths
          .filter((p) => p.kind === 'field')
          .map((p) => (
            <option key={p.path} value={p.path}>
              {p.path}
            </option>
          ))}
      </Select>

      <Select
        aria-label={`Transform for mapping ${index + 1}`}
        value={transform}
        onChange={(e) =>
          onChange({
            transform: { kind: e.target.value as NonNullable<FieldMappingDto['transform']>['kind'] },
          })
        }
      >
        <option value="none">as it arrives</option>
        <option value="trim">trim</option>
        <option value="lowercase">lowercase</option>
        <option value="uppercase">uppercase</option>
        <option value="to_number">to number</option>
        <option value="to_boolean">to true/false</option>
        <option value="years_since">years since (date → age)</option>
      </Select>

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove mapping ${index + 1}`}
        className="ml-auto rounded px-1.5 py-0.5 text-label text-content-muted hover:bg-surface hover:text-block focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        Remove
      </button>
    </div>
  );
}

function Report({ report }: { report: ValidationReportDto }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Rows held" value={String(report.rows)} />
        <Metric label="Rows with no problem" value={String(report.clean)} tone="pass" />
        <Metric
          label="Values refused"
          value={String(report.errors)}
          tone={report.errors > 0 ? 'block' : 'pass'}
        />
        <Metric
          label="Required and unfilled"
          value={String(report.missingRequired.length)}
          tone={report.missingRequired.length > 0 ? 'block' : 'pass'}
        />
      </div>

      {/* By column, not by row. An import fails for a handful of reasons
          repeated thousands of times, and a per-row list buries that. */}
      <div className="divide-y divide-border rounded border border-border">
        {report.columns.map((c) => (
          <div key={c.column} className="px-card py-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-label text-content">{c.column}</span>
              <span aria-hidden className="text-content-muted">
                →
              </span>
              <span className="font-mono text-label text-content-subtle">{c.path}</span>
              <Badge tone={c.failed > 0 ? 'block' : 'pass'}>
                {c.filled} filled, {c.failed} refused
              </Badge>
            </div>
            {c.examples.map((e) => (
              <p key={e} className="mt-0.5 text-label text-block">
                {e}
              </p>
            ))}
          </div>
        ))}
      </div>

      {report.missingRequired.length > 0 ? (
        <p className="text-body text-block">
          Required by the model and filled by nothing: {report.missingRequired.join(', ')}.
        </p>
      ) : null}
      {report.unmapped.length > 0 ? (
        <p className="text-label text-content-muted">
          Columns nothing uses: {report.unmapped.join(', ')}. Not an error — worth a look when a
          source has changed shape.
        </p>
      ) : null}
    </div>
  );
}

function IntakeView() {
  const queryClient = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('edit:integrations');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<DataSourceDto['kind']>('file');
  const [paste, setPaste] = useState('');
  const [draftMappings, setDraftMappings] = useState<FieldMappingDto[] | null>(null);
  const [report, setReport] = useState<ValidationReportDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sources = useQuery({ queryKey: ['data-sources'], queryFn: () => apiClient.listDataSources() });
  const model = useQuery({ queryKey: ['profile-schema'], queryFn: () => apiClient.getProfileSchema() });

  const list = sources.data?.sources ?? [];
  const selected = list.find((s) => s.id === selectedId) ?? null;
  const mappings = draftMappings ?? selected?.mappings ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['data-sources'] });
  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed.');

  const create = useMutation({
    mutationFn: () => apiClient.createDataSource({ name: name.trim(), kind }),
    onSuccess: (s) => {
      void refresh();
      setSelectedId(s.id);
      setCreating(false);
      setName('');
    },
    onError: fail,
  });

  const land = useMutation({
    mutationFn: (rows: Record<string, unknown>[]) => apiClient.landRows(selected!.id, rows, true),
    onSuccess: () => {
      void refresh();
      setReport(null);
      setPaste('');
      setError(null);
    },
    onError: fail,
  });

  const saveMappings = useMutation({
    mutationFn: () => apiClient.updateDataSource(selected!.id, { mappings }),
    onSuccess: () => {
      void refresh();
      setDraftMappings(null);
      setReport(null);
      setError(null);
    },
    onError: fail,
  });

  const validate = useMutation({
    mutationFn: () => apiClient.validateDataSource(selected!.id),
    onSuccess: (r) => {
      setReport(r.report);
      setError(null);
      void refresh();
    },
    onError: fail,
  });

  const activate = useMutation({
    mutationFn: () => apiClient.activateDataSource(selected!.id),
    onSuccess: () => {
      void refresh();
      setError(null);
    },
    onError: (e) => {
      // The refusal carries its reasons; showing only "409" would hide the
      // whole point of the two stages before this one.
      if (e instanceof ApiError && Array.isArray((e as unknown as { problems?: unknown }).problems)) {
        setError(e.message);
      }
      fail(e);
    },
  });

  if (sources.isLoading || model.isLoading) return <LoadingState label="Loading intake" />;
  if (sources.error) {
    return <ErrorState description="Could not load the sources." onRetry={() => void sources.refetch()} />;
  }

  /** Parse pasted JSON rows. Refused rather than guessed at. */
  const parsePaste = () => {
    try {
      const parsed = JSON.parse(paste);
      if (!Array.isArray(parsed)) throw new Error('Expected an array of records.');
      land.mutate(parsed as Record<string, unknown>[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That is not valid JSON.');
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded border border-block/40 bg-block-subtle px-2 py-1.5 text-body text-block">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="Sources"
          description="Where customer records come from, and how each source's shape maps onto the model."
          actions={
            canEdit ? (
              <Button variant="primary" onClick={() => setCreating(true)}>
                New source
              </Button>
            ) : undefined
          }
        />
        {list.length === 0 ? (
          <EmptyState
            title="No sources yet"
            description="Define one, land some records against it, and map its columns onto the data model."
          />
        ) : (
          <div className="divide-y divide-border">
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedId(s.id);
                  setDraftMappings(null);
                  setReport(null);
                  setError(null);
                }}
                aria-current={s.id === selectedId ? 'true' : undefined}
                className={
                  'flex w-full flex-wrap items-center gap-3 px-card py-2 text-left hover:bg-surface-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent' +
                  (s.id === selectedId ? ' bg-surface-sunken' : '')
                }
              >
                <span className="font-medium text-content">{s.name}</span>
                <Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge>
                <span className="text-label text-content-muted">
                  {s.landedRows} row{s.landedRows === 1 ? '' : 's'} · {s.mappings.length} mapping
                  {s.mappings.length === 1 ? '' : 's'}
                </span>
                <span className="ml-auto">
                  <Pipeline source={s} />
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      {selected ? (
        <>
          <Card>
            <CardHeader
              title={`Land — ${selected.name}`}
              description="Records are held as they arrived, unmapped. Landing observes the column names and does not interpret them. New rows send the source back to draft, because rows that arrive after a verdict were not the rows it was about."
            />
            <div className="space-y-2 px-card py-3">
              <Field label="Records as JSON" htmlFor="paste">
                <textarea
                  id="paste"
                  rows={5}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder='[{"cust_id":"c1","dob":"1990-01-15","band":"A"}]'
                  className="w-full rounded border border-border bg-surface px-2 py-1.5 font-mono text-label text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                />
              </Field>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={parsePaste}
                  disabled={!canEdit || land.isPending || paste.trim() === ''}
                >
                  Land records
                </Button>
                {selected.columns.length > 0 ? (
                  <span className="text-label text-content-muted">
                    Columns seen: {selected.columns.join(', ')}
                  </span>
                ) : null}
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Map"
              description="Each column onto a field the model declares. A path the model does not have cannot be chosen."
              actions={
                canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setDraftMappings([...mappings, { column: '', path: '' }])
                      }
                      disabled={selected.columns.length === 0}
                    >
                      Add mapping
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => saveMappings.mutate()}
                      disabled={draftMappings === null || saveMappings.isPending}
                    >
                      Save mappings
                    </Button>
                  </div>
                ) : undefined
              }
            />
            <div className="space-y-2 px-card py-3">
              {selected.columns.length === 0 ? (
                <p className="text-body text-content-muted">
                  Land some records first — the columns to map come from what actually arrived.
                </p>
              ) : mappings.length === 0 ? (
                <p className="text-body text-content-muted">Nothing mapped yet.</p>
              ) : (
                mappings.map((m, i) => (
                  <MappingRow
                    key={i}
                    index={i}
                    mapping={m}
                    columns={selected.columns}
                    paths={model.data?.paths ?? []}
                    onChange={(patch) =>
                      setDraftMappings(mappings.map((x, n) => (n === i ? { ...x, ...patch } : x)))
                    }
                    onRemove={() => setDraftMappings(mappings.filter((_, n) => n !== i))}
                  />
                ))
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Validate and activate"
              description="Activation is refused unless the last validation over the rows actually held found no errors and every required field is filled."
              actions={
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => validate.mutate()}
                    disabled={validate.isPending || selected.landedRows === 0}
                  >
                    Validate
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => activate.mutate()}
                    disabled={!canEdit || activate.isPending || selected.status === 'active'}
                  >
                    {selected.status === 'active' ? 'Active' : 'Activate'}
                  </Button>
                </div>
              }
            />
            <div className="px-card py-3">
              {report ? (
                <Report report={report} />
              ) : (
                <p className="text-body text-content-muted">
                  Not validated since the last change. Run it to see what the model refuses.
                </p>
              )}
            </div>
          </Card>
        </>
      ) : null}

      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="New source"
        description="Name it and say how records arrive. Mapping comes after the first rows land."
        submitLabel="Create source"
        busy={create.isPending}
        onSubmit={() => create.mutate()}
      >
        <Field label="Name" htmlFor="source-name">
          <Input
            id="source-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CRM nightly export"
          />
        </Field>
        <Field label="Arrives as" htmlFor="source-kind">
          <Select
            id="source-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as DataSourceDto['kind'])}
          >
            <option value="file">A file</option>
            <option value="http">An HTTP push</option>
            <option value="inline">Pasted records</option>
          </Select>
        </Field>
      </FormDialog>
    </div>
  );
}

export default function IntakePage() {
  return (
    <RequireAuth>
      <PageHeader
        title="Intake"
        description="Land records as they arrive, map them onto the data model, validate, and only then activate. Held in memory and lost on restart — retention is ADR-004 and still open."
      />
      <PageBody>
        <IntakeView />
      </PageBody>
    </RequireAuth>
  );
}
