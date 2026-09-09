import { test, expect } from '@playwright/test';
import { login, resetStore, ACCOUNTS } from './helpers';

/**
 * The artifact registry, through the console.
 *
 * The gap this closes was recorded for weeks: the console showed the
 * compiler's verdict and nothing acted on it, so a flow with an error
 * could be promoted to production and fail at execution instead of at publish.
 * The first test here is that gap, closed.
 */

/** A flow the compiler refuses: no arbitration node, no deliverable creative. */
const UNCOMPILABLE = 'plan-fit-nudges';
/** A flow that published cleanly and is running in production. */
const PUBLISHED = 'next-best-action';

test.describe('the compilation gate', () => {
  test.beforeEach(async ({ page }) => {
    await resetStore(page);
    await login(page, ACCOUNTS.marcus);
  });

  test('a flow that does not compile is not in the registry', async ({ page }) => {
    await page.goto(`/decision-flows/${UNCOMPILABLE}`);

    await expect(page.getByRole('heading', { name: 'Registry' })).toBeVisible();
    await expect(page.getByText('Not in the registry')).toBeVisible();
    // The point, stated where someone will read it.
    await expect(page.getByText(/cannot be promoted and cannot reach execution/)).toBeVisible();
  });

  test('the refusal is in the registry log, not silently dropped', async ({ page }) => {
    await page.goto(`/decision-flows/${UNCOMPILABLE}`);

    await expect(page.getByText('PublishRejected')).toBeVisible();
    // Naming the codes is what makes the log answerable rather than decorative.
    // Matched on the log line, because the compile report on the same page
    // lists the codes too — and this test is about the registry recording it.
    await expect(
      page.getByText(/Refused plan-fit-nudges .* NO_ARBITRATION/)
    ).toBeVisible();
  });

  // covers: publishArtifact
  test('a flow that compiles is published and running', async ({ page }) => {
    await page.goto(`/decision-flows/${PUBLISHED}`);

    await expect(page.getByRole('heading', { name: 'Registry' })).toBeVisible();
    // One per published version, so `.first()`: the seed now publishes the
    // whole declared history rather than only the active version.
    await expect(page.getByText('ArtifactPublished').first()).toBeVisible();
    // Scoped to the active version rather than `.first()`: every publish event
    // says this — it is true of each version at the moment it was published —
    // and the one worth asserting is the version actually running.
    await expect(
      page.getByText(/Published next-best-action 2\.4\.0 .* Not active anywhere until promoted/)
    ).toBeVisible();
  });
});

test.describe('promotion and rollback', () => {
  test.beforeEach(async ({ page }) => {
    await resetStore(page);
    await login(page, ACCOUNTS.marcus);
    await page.goto(`/decision-flows/${PUBLISHED}`);
  });

  // covers: promoteVersion
  test('promoting to an environment is recorded', async ({ page }) => {
    await page.getByRole('button', { name: 'Promote to staging' }).first().click();

    await expect(page.getByText('VersionPromoted').first()).toBeVisible();
    await expect(page.getByText(/Promoted next-best-action .* to staging/)).toBeVisible();

    // And in the console's own audit log, not only the registry's.
    await page.goto('/audit');
    await expect(page.getByText('VersionPromoted').first()).toBeVisible();
  });

  test('rollback is offered only once there is somewhere to go back to', async ({ page }) => {
    // Production has one version promoted and no predecessor.
    await expect(page.getByRole('button', { name: 'Roll back' })).toHaveCount(0);
  });

  // covers: rollbackVersion
  test('rollback appears once an environment has a predecessor, and works', async ({ page, request }) => {
    // The seed promotes one version per flow, so a second has to be promoted
    // to reach the state rollback exists for. Doing it through the
    // API rather than the UI because there is no authoring surface yet — the
    // point being tested is the registry, not how a version gets drafted.
    const login = await request.post('/api/auth/login', {
      data: { email: ACCOUNTS.marcus, password: 'demo' },
    });
    const token = (await login.json()).token;
    const headers = { Authorization: `Bearer ${token}` };

    const entry = await (
      await request.get(`/api/registry/telco-uk/${PUBLISHED}`, { headers })
    ).json();
    const artifact = entry.versions[0].artifact;

    const published = await request.post(`/api/registry/telco-uk/${PUBLISHED}`, {
      headers,
      data: {
        version: '2.5.0',
        source: {
          id: artifact.id,
          version: '2.5.0',
          tenantId: artifact.tenantId,
          nodes: artifact.nodes.map((n: { label: string }, i: number) =>
            i === 0 ? { ...n, label: `${n.label} v2` } : n
          ),
          edges: artifact.edges,
          candidateKeys: artifact.candidateKeys,
          packageRanges: { '@metis/nodes-core': '^1.2.0', '@metis/core': '^2.0.0' },
        },
      },
    });
    expect((await published.json()).status).toBe('published');

    await page.reload();
    await page.getByRole('button', { name: 'Promote to production' }).first().click();
    await expect(page.getByText(/replacing 2\.4\.0/)).toBeVisible();

    // Now there is somewhere to go back to.
    const rollback = page.getByRole('button', { name: 'Roll back' });
    await expect(rollback).toHaveCount(1);
    await rollback.click();

    await expect(page.getByText('VersionRolledBack')).toBeVisible();
    await expect(page.getByText(/back from 2\.5\.0 to 2\.4\.0/)).toBeVisible();
  });

  test('the environment list states what is running and what preceded it', async ({ page }) => {
    // Environments not yet promoted to say so, rather than showing nothing.
    await expect(page.getByText('nothing promoted').first()).toBeVisible();
    // And the one that is running names its version.
    await expect(page.getByText('2.4.0').first()).toBeVisible();
  });
});

test.describe('registry permissions', () => {
  test('an account without promote:flows cannot promote', async ({ page }) => {
    await resetStore(page);
    await login(page, ACCOUNTS.priya);
    await page.goto(`/decision-flows/${PUBLISHED}`);

    // Compliance can see what is running — that is most of their job — without
    // being able to change what customers get.
    await expect(page.getByRole('heading', { name: 'Registry' })).toBeVisible();
    await expect(page.getByText('Published versions', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Promote to/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Roll back' })).toHaveCount(0);
  });

  test('the API refuses too, not just the UI', async ({ page, request }) => {
    await resetStore(page);
    const res = await request.post('/api/auth/login', {
      data: { email: ACCOUNTS.priya, password: 'demo' },
    });
    const token = (await res.json()).token;

    const promote = await request.post(`/api/registry/telco-uk/${PUBLISHED}/promote`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { version: '2.4.0', environment: 'staging' },
    });
    expect(promote.status()).toBe(403);
  });
});

test.describe('the registry API', () => {
  let token: string;

  test.beforeEach(async ({ page, request }) => {
    await resetStore(page);
    const res = await request.post('/api/auth/login', {
      data: { email: ACCOUNTS.marcus, password: 'demo' },
    });
    token = (await res.json()).token;
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  test('refuses a version that was never published', async ({ request }) => {
    const res = await request.post(`/api/registry/telco-uk/${PUBLISHED}/promote`, {
      headers: auth(),
      data: { version: '99.0.0', environment: 'staging' },
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).message).toMatch(/has not been published/);
  });

  test('refuses to promote what is already active', async ({ request }) => {
    const res = await request.post(`/api/registry/telco-uk/${PUBLISHED}/promote`, {
      headers: auth(),
      data: { version: '2.4.0', environment: 'production' },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).message).toMatch(/already active/);
  });

  test('refuses to roll back when there is nothing to go back to', async ({ request }) => {
    const res = await request.post(`/api/registry/telco-uk/${PUBLISHED}/rollback`, {
      headers: auth(),
      data: { environment: 'production' },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).message).toMatch(/no earlier version/);
  });

  test('rolling back twice returns to where you started', async ({ request }) => {
    // What an operator means by "undo that". Walking backwards through history
    // would land them on something nobody remembers.
    const entry = await (
      await request.get(`/api/registry/telco-uk/${PUBLISHED}`, { headers: auth() })
    ).json();
    const artifact = entry.versions[0].artifact;

    await request.post(`/api/registry/telco-uk/${PUBLISHED}`, {
      headers: auth(),
      data: {
        version: '2.5.0',
        source: {
          id: artifact.id,
          version: '2.5.0',
          tenantId: artifact.tenantId,
          nodes: artifact.nodes.map((n: { label: string }, i: number) =>
            i === 0 ? { ...n, label: `${n.label} v2` } : n
          ),
          edges: artifact.edges,
          candidateKeys: artifact.candidateKeys,
          packageRanges: { '@metis/nodes-core': '^1.2.0', '@metis/core': '^2.0.0' },
        },
      },
    });

    const active = async () =>
      (
        await (
          await request.get(`/api/registry/telco-uk/${PUBLISHED}`, { headers: auth() })
        ).json()
      ).environments.find((e: { environment: string }) => e.environment === 'production')
        .activeVersion;

    await request.post(`/api/registry/telco-uk/${PUBLISHED}/promote`, {
      headers: auth(),
      data: { version: '2.5.0', environment: 'production' },
    });
    expect(await active()).toBe('2.5.0');

    await request.post(`/api/registry/telco-uk/${PUBLISHED}/rollback`, {
      headers: auth(),
      data: { environment: 'production' },
    });
    expect(await active()).toBe('2.4.0');

    await request.post(`/api/registry/telco-uk/${PUBLISHED}/rollback`, {
      headers: auth(),
      data: { environment: 'production' },
    });
    expect(await active()).toBe('2.5.0');
  });

  test('publishing identical content again is a no-op, not a second publish', async ({ request }) => {
    const entry = await (
      await request.get(`/api/registry/telco-uk/${PUBLISHED}`, { headers: auth() })
    ).json();
    const before = await (
      await request.get(`/api/registry/telco-uk/events?flowName=${PUBLISHED}`, {
        headers: auth(),
      })
    ).json();

    // Republish exactly what is there. A retried deploy must not look like a
    // second publish in the log.
    const artifact = entry.versions[0].artifact;
    const republish = await request.post(`/api/registry/telco-uk/${PUBLISHED}`, {
      headers: auth(),
      data: {
        version: entry.versions[0].version,
        source: {
          id: artifact.id,
          version: artifact.version,
          tenantId: artifact.tenantId,
          nodes: artifact.nodes,
          edges: artifact.edges,
          candidateKeys: artifact.candidateKeys,
          packageRanges: { '@metis/nodes-core': '^1.2.0', '@metis/core': '^2.0.0' },
        },
      },
    });

    expect(republish.status()).toBe(201);
    expect((await republish.json()).status).toBe('unchanged');

    const after = await (
      await request.get(`/api/registry/telco-uk/events?flowName=${PUBLISHED}`, {
        headers: auth(),
      })
    ).json();
    expect(after.events.length).toBe(before.events.length);
  });

  test('refuses different content under a published version', async ({ request }) => {
    const entry = await (
      await request.get(`/api/registry/telco-uk/${PUBLISHED}`, { headers: auth() })
    ).json();
    const artifact = entry.versions[0].artifact;

    const res = await request.post(`/api/registry/telco-uk/${PUBLISHED}`, {
      headers: auth(),
      data: {
        version: entry.versions[0].version,
        source: {
          id: artifact.id,
          version: artifact.version,
          tenantId: artifact.tenantId,
          // One renamed label is enough to change the artifact hash.
          nodes: artifact.nodes.map((n: { label: string }, i: number) =>
            i === 0 ? { ...n, label: 'Renamed' } : n
          ),
          edges: artifact.edges,
          candidateKeys: artifact.candidateKeys,
          packageRanges: { '@metis/nodes-core': '^1.2.0', '@metis/core': '^2.0.0' },
        },
      },
    });

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.status).toBe('rejected');
    expect(body.reason).toBe('immutable');
    expect(body.existingHash).not.toBe(body.attemptedHash);
  });

  test('refuses to publish a flow that does not compile', async ({ request }) => {
    const res = await request.post(`/api/registry/telco-uk/${PUBLISHED}`, {
      headers: auth(),
      data: {
        version: '9.9.9',
        source: {
          id: PUBLISHED,
          version: '9.9.9',
          tenantId: 'telco-uk',
          nodes: [{ id: 'n1', type: 'source', label: 'Source', estimatedMs: 1 }],
          edges: [{ from: 'n1', to: 'nowhere' }],
          candidateKeys: [],
          packageRanges: {},
        },
      },
    });

    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.status).toBe('rejected');
    expect(body.reason).toBe('compilation');
    expect(body.diagnostics.some((d: { severity: string }) => d.severity === 'error')).toBe(true);

    // And nothing was stored.
    const entry = await (
      await request.get(`/api/registry/telco-uk/${PUBLISHED}`, { headers: auth() })
    ).json();
    expect(entry.versions.some((v: { version: string }) => v.version === '9.9.9')).toBe(false);
  });
});
