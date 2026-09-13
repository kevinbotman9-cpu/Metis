'use client';

import { useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/components/auth-provider';
import { useTheme } from '@/components/theme-provider';
import {
  PageBody,
  PageHeader,
  Card,
  CardHeader,
  CardBody,
  Badge,
} from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { EntityFormDialog } from '@/components/entity-form-dialog';
import { TENANT_SETTINGS_KEY, useFormat, useTenantSettings } from '@/components/tenant-format';
import { apiClient, type TenantSettingsDto } from '@/lib/api-client';
import { OPENAPI_VERSION, OPERATIONS } from '@metis/client';

/**
 * The fifth of September, 14:30 UTC: the date en-US and en-GB write as each
 * other's ninth of May, which is the ambiguity this setting exists to settle.
 */
const EXAMPLE_INSTANT = '2026-09-05T14:30:00Z';

/**
 * How this tenant reads dates, numbers and money. G-092.
 *
 * The page stays hand-built — ADR-015 holds the Form pattern for design review
 * and keeps `/settings` as it is until then — but the form is not: it is the
 * `TenantSettings` descriptor, drawn by the generic renderer (Rule 8). The
 * examples are formatted by the same formatter every other screen uses, so what
 * this card shows is what the console shows.
 */
function TenantCard() {
  const { hasPermission } = useAuth();
  const settings = useTenantSettings();
  const format = useFormat();
  const [editing, setEditing] = useState(false);
  const canEdit = hasPermission('admin:settings');
  const data = settings.data;

  return (
    <Card>
      <CardHeader
        title="Tenant"
        description="Every date, number and amount in the console is formatted in this tenant's locale."
      />
      <CardBody>
        <dl className="space-y-2 text-body">
          <div className="flex justify-between gap-3">
            <dt className="text-content-subtle">Locale</dt>
            <dd className="font-mono text-label">{data?.locale}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-content-subtle">Currency</dt>
            <dd className="font-mono text-label">{data?.currency}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-content-subtle">A date reads</dt>
            <dd className="tnum">{format.date(EXAMPLE_INSTANT, { timeZone: 'UTC' })}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-content-subtle">An amount reads</dt>
            <dd className="tnum">{format.minor(123456)}</dd>
          </div>
          {data?.updatedAt ? (
            <div className="flex justify-between gap-3">
              <dt className="text-content-subtle">Last changed</dt>
              <dd className="text-right text-label text-content-muted">
                {format.dateTime(data.updatedAt)} by {data.updatedBy}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-4 border-t border-border pt-3">
          {canEdit ? (
            <Button onClick={() => setEditing(true)}>Edit tenant settings</Button>
          ) : (
            <p className="text-label text-content-muted">
              Changing these needs the <code className="font-mono">admin:settings</code> permission.
            </p>
          )}
        </div>
      </CardBody>

      {editing && data ? (
        <EntityFormDialog<TenantSettingsDto>
          open
          onOpenChange={setEditing}
          entity="TenantSettings"
          record={data}
          title="Tenant settings"
          save={(body) => apiClient.updateTenantSettings(body as Partial<TenantSettingsDto>)}
          invalidate={[TENANT_SETTINGS_KEY]}
        />
      ) : null}
    </Card>
  );
}

function SettingsView() {
  const { user } = useAuth();
  const format = useFormat();
  const { colorScheme, density, setColorScheme, setDensity } = useTheme();

  return (
    <PageBody>
      <PageHeader
        title="Settings"
        description="Your account, appearance and tenant configuration."
      />

      <div className="grid gap-stack lg:grid-cols-2">
        <Card>
          <CardHeader title="Account" description="Signed-in identity and what it can do." />
          <CardBody>
            <dl className="space-y-2 text-body">
              <div className="flex justify-between gap-3">
                <dt className="text-content-subtle">Name</dt>
                <dd className="font-medium">{user?.name}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="shrink-0 text-content-subtle">Email</dt>
                <dd className="truncate text-right font-mono text-label">{user?.email}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-content-subtle">Tenant</dt>
                <dd>{user?.tenantId}</dd>
              </div>
            </dl>

            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-1.5 text-label uppercase tracking-wide text-content-subtle">
                Roles
              </p>
              <div className="flex flex-wrap gap-1">
                {user?.roles.map((r) => (
                  <Badge key={r} tone="accent">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-1.5 text-label uppercase tracking-wide text-content-subtle">
                Permissions
              </p>
              <div className="flex flex-wrap gap-1">
                {user?.permissions.map((p) => (
                  <code
                    key={p}
                    className="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-label text-content-muted"
                  >
                    {p}
                  </code>
                ))}
              </div>
              <p className="mt-2 text-label text-content-muted">
                Navigation and actions are filtered by these. Signing in as a different demo
                account changes what this console shows.
              </p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Appearance"
            description="Stored per browser. Density changes row height and padding across every table."
          />
          <CardBody className="space-y-4">
            <div>
              <p className="mb-1.5 text-label uppercase tracking-wide text-content-subtle">
                Colour scheme
              </p>
              <div className="flex gap-2">
                {(['light', 'dark'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setColorScheme(s)}
                    aria-pressed={colorScheme === s}
                    className={cn(
                      'flex-1 rounded border px-3 py-2 text-body font-medium capitalize transition-colors',
                      colorScheme === s
                        ? 'border-accent bg-accent text-on-accent'
                        : 'border-border text-content-muted hover:bg-surface-sunken'
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-label uppercase tracking-wide text-content-subtle">
                Density
              </p>
              <div className="flex gap-2">
                {(['compact', 'comfortable'] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDensity(d)}
                    aria-pressed={density === d}
                    className={cn(
                      'flex-1 rounded border px-3 py-2 text-body font-medium capitalize transition-colors',
                      density === d
                        ? 'border-accent bg-accent text-on-accent'
                        : 'border-border text-content-muted hover:bg-surface-sunken'
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-label text-content-muted">
                Currently <strong>{colorScheme}</strong> × <strong>{density}</strong>. All four
                combinations are covered by the Storybook theme axes.
              </p>
            </div>
          </CardBody>
        </Card>

        <TenantCard />

        <Card className="lg:col-span-2">
          <CardHeader
            title="Environment"
            description="Where this console is getting its data."
          />
          <CardBody>
            {/* Not a <dl>: each entry carries explanatory prose as well as a
                term and value, which a definition list may not contain. */}
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  term: 'API source',
                  value: 'Development route handlers',
                  detail: (
                    <>
                      Fixture store served over HTTP from{' '}
                      <code className="font-mono">app/api</code>. Swap the base URL to point at a
                      real execution plane.
                    </>
                  ),
                },
                {
                  // Read from the generated client, not written here. This was
                  // "OpenAPI 3.1 · 30 operations" while the spec held 71: a
                  // count in two places, one of them under a heading claiming
                  // every call maps to an operationId. `OPERATIONS` is emitted
                  // from docs/metis-api.openapi.yaml, and the gates fail if the
                  // generated file drifts from the spec.
                  term: 'Contract',
                  value: `OpenAPI ${OPENAPI_VERSION} · ${format.number(Object.keys(OPERATIONS).length)} operations`,
                  detail: 'Every call in this console maps to an operationId in the spec.',
                },
                {
                  term: 'Persistence',
                  value: 'In-memory',
                  detail:
                    'Edits persist for the life of the server process and are written to the audit log. A restart restores the seed data. Durable storage lands with the execution plane.',
                },
              ].map((entry) => (
                <li key={entry.term} className="rounded border border-border px-3 py-2">
                  <p className="text-label uppercase tracking-wide text-content-subtle">
                    {entry.term}
                  </p>
                  <p className="mt-0.5 text-body font-medium">{entry.value}</p>
                  <p className="mt-1 text-label text-content-muted">{entry.detail}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </PageBody>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsView />
    </RequireAuth>
  );
}
