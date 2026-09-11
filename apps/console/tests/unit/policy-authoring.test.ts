import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST, PUT } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';
import { currentCatalogue } from '@/mocks/catalogue-state';

/**
 * Authoring a targeting policy against the data model.
 *
 * The defect these close, demonstrated against the running engine before any of
 * this existed: `address.fibre_availabl` moved the winner from `acq_fibre_900`
 * to `acq_sim_30`, and the trace reported `ELIGIBILITY_FAILED
 * (pol_fibre_available)`. The typo did not error. It decided, and the audit
 * trail defended the wrong answer.
 *
 * Policies were also editable only by changing a fixture, so this is the first
 * write path they have had. Both halves are checked here: that the model is
 * served in a shape the picker can render, and that the server refuses what the
 * picker would not have let anybody build.
 */

const USER = (email: string) => {
  const u = store.users.find((x) => x.email === email);
  if (!u) throw new Error(`no fixture user ${email}`);
  return { authorization: `Bearer metis.${u.id}`, 'content-type': 'application/json' };
};
/** Compliance officer: has edit:policies. */
const PRIYA = () => USER('priya.natarajan@telco.example');
/** Decision architect: deliberately does not. */
const SARAH = () => USER('sarah.chen@telco.example');

const call = (
  path: string[],
  body?: unknown,
  method: 'GET' | 'POST' | 'PUT' = 'POST',
  headers: Record<string, string> = PRIYA()
) => {
  const req = new Request(`http://localhost/api/${path.join('/')}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const ctx = { params: Promise.resolve({ path }) };
  if (method === 'GET') return GET(req, ctx);
  return method === 'PUT' ? PUT(req, ctx) : POST(req, ctx);
};

const policy = (over: Record<string, unknown> = {}) => ({
  name: 'Adults only',
  kind: 'eligibility',
  description: 'Regulatory minimum age.',
  conditions: [{ field: 'customer.age', operator: 'gte', value: 18 }],
  scope: { level: 'tenant', targetId: null },
  active: false,
  ...over,
});

describe('the data model is served', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('returns entities, paths and no structural problems', async () => {
    const res = await call(['profile-schema', 'telco-uk'], undefined, 'GET');
    const body = (await res.json()) as {
      schema: { entities: unknown[]; root: string };
      paths: { path: string; type: string; operators: string[] }[];
      problems: string[];
    };

    expect(res.status).toBe(200);
    expect(body.schema.entities.length).toBeGreaterThan(3);
    expect(body.problems).toEqual([]);
    expect(body.paths.length).toBeGreaterThan(10);
  });

  it('serves the operators, so the editor cannot offer a set the compiler rejects', async () => {
    // The reason this is on the wire rather than derived in the client. Two
    // implementations of "which operators does an integer admit" would drift,
    // and the drift would show up as a policy that saves and will not compile.
    const res = await call(['profile-schema', 'telco-uk'], undefined, 'GET');
    const { paths } = (await res.json()) as {
      paths: { path: string; type: string; operators: string[] }[];
    };

    const age = paths.find((p) => p.path === 'customer.age');
    expect(age?.type).toBe('integer');
    expect(age?.operators).toContain('gte');
    expect(age?.operators).not.toContain('contains');

    const status = paths.find((p) => p.path === 'customer.credit_status');
    expect(status?.type).toBe('enum');
  });

  it('offers rollups and never a path through a one-to-many', async () => {
    const res = await call(['profile-schema', 'telco-uk'], undefined, 'GET');
    const { paths } = (await res.json()) as { paths: { path: string; kind: string }[] };

    expect(paths.some((p) => p.path === 'customer.worst_arrears_days' && p.kind === 'aggregation')).toBe(true);
    // There is no single arrears_days to compare across many accounts.
    expect(paths.some((p) => p.path.startsWith('customer.accounts.'))).toBe(false);
  });
});

describe('creating a policy', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('stores one the model accepts, and the engine sees it', async () => {
    const before = currentCatalogue().targetingPolicies.length;
    const res = await call(['targeting-policies', 'telco-uk'], policy());
    const created = (await res.json()) as { id: string; name: string };

    expect(res.status).toBe(201);
    expect(created.id).toMatch(/^pol_/);

    // Not just stored — reaching the catalogue the engine decides against is
    // what makes this configuration rather than a form.
    expect(currentCatalogue().targetingPolicies.length).toBe(before + 1);
    expect(currentCatalogue().targetingPolicies.some((p) => p.id === created.id)).toBe(true);
  });

  it('refuses one character wrong in a leaf, and says which condition', async () => {
    // The demonstrated defect, at the write path.
    const res = await call(
      ['targeting-policies', 'telco-uk'],
      policy({ conditions: [{ field: 'address.fibre_availabl', operator: 'eq', value: true }] })
    );
    const body = (await res.json()) as {
      error: string;
      problems: { field: string; message: string; code: string }[];
    };

    expect(res.status).toBe(400);
    expect(body.error).toBe('invalid_policy');
    expect(body.problems[0].field).toBe('conditions.0');
    expect(body.problems[0].code).toBe('UNKNOWN_FIELD');
    expect(body.problems[0].message).toContain("Did you mean 'customer.address.fibre_available'?");
  });

  it('refuses a comparison the type cannot satisfy', async () => {
    const res = await call(
      ['targeting-policies', 'telco-uk'],
      policy({ conditions: [{ field: 'customer.age', operator: 'contains', value: 'x' }] })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).problems[0].code).toBe('OPERATOR_NOT_ALLOWED');
  });

  it('refuses a value outside an enum', async () => {
    // `passed` for `pass` reads correctly, matches nothing, and would suppress
    // every candidate while looking like a working rule.
    const res = await call(
      ['targeting-policies', 'telco-uk'],
      policy({ conditions: [{ field: 'customer.credit_status', operator: 'eq', value: 'passed' }] })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { problems: { code: string; message: string }[] };
    expect(body.problems[0].code).toBe('NOT_A_MEMBER');
    expect(body.problems[0].message).toContain("Did you mean 'pass'?");
  });

  it('names the condition that is wrong when several are not', async () => {
    // The dialog puts each message against the row that produced it. A single
    // sentence at the top of the form makes the person hunt for the field.
    const res = await call(
      ['targeting-policies', 'telco-uk'],
      policy({
        conditions: [
          { field: 'customer.age', operator: 'gte', value: 18 },
          { field: 'customer.nope', operator: 'eq', value: 1 },
        ],
      })
    );
    const body = (await res.json()) as { problems: { field: string }[] };
    expect(body.problems.map((p) => p.field)).toEqual(['conditions.1']);
  });

  it('refuses a policy with no conditions', async () => {
    // Which would match every candidate — never what was meant, and a
    // spectacular way to break an eligibility gate.
    const res = await call(['targeting-policies', 'telco-uk'], policy({ conditions: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).problems[0].code).toBe('EMPTY');
  });

  it('stores nothing when it refuses', async () => {
    const before = store.targetingPolicies.length;
    await call(
      ['targeting-policies', 'telco-uk'],
      policy({ conditions: [{ field: 'customer.nope', operator: 'eq', value: 1 }] })
    );
    expect(store.targetingPolicies.length).toBe(before);
  });

  it('refuses an account that cannot author policies', async () => {
    // Sarah authors offers and flows; policies are Priya's. The segregation is
    // in the fixture and the route enforces it rather than the screen.
    const res = await call(['targeting-policies', 'telco-uk'], policy(), 'POST', SARAH());
    expect(res.status).toBe(403);
    expect((await res.json()).message).toContain('edit:policies');
  });

  it('records who wrote it', async () => {
    const before = store.auditEvents.length;
    await call(['targeting-policies', 'telco-uk'], policy());
    // Newest first: `recordAudit` unshifts, so the entry just written is at
    // the head rather than the tail.
    const event = store.auditEvents[0];

    expect(store.auditEvents.length).toBe(before + 1);
    expect(event.eventType).toBe('TargetingPolicyCreated');
    expect(event.actor).toBe('priya.natarajan@telco.example');
  });
});

describe('editing a policy', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('applies the change to what the engine reads', async () => {
    const target = store.targetingPolicies[0];
    const res = await call(
      ['targeting-policies', 'telco-uk', target.id],
      { ...target, name: 'Renamed', active: !target.active },
      'PUT'
    );
    expect(res.status).toBe(200);

    const live = currentCatalogue().targetingPolicies.find((p) => p.id === target.id);
    expect(live?.name).toBe('Renamed');
  });

  it('enforces the same rules as create', async () => {
    // A policy that could be edited into a state it could not be created in is
    // the kind of asymmetry nobody finds until it matters.
    const target = store.targetingPolicies[0];
    const res = await call(
      ['targeting-policies', 'telco-uk', target.id],
      { conditions: [{ field: 'address.fibre_availabl', operator: 'eq', value: true }] },
      'PUT'
    );
    expect(res.status).toBe(400);
    expect((await res.json()).problems[0].code).toBe('UNKNOWN_FIELD');
  });

  it('leaves the policy untouched when it refuses', async () => {
    const target = store.targetingPolicies[0];
    const original = JSON.stringify(target.conditions);

    await call(
      ['targeting-policies', 'telco-uk', target.id],
      { conditions: [{ field: 'customer.nope', operator: 'eq', value: 1 }] },
      'PUT'
    );

    expect(JSON.stringify(store.targetingPolicies[0].conditions)).toBe(original);
  });

  it('404s for a policy that does not exist', async () => {
    const res = await call(['targeting-policies', 'telco-uk', 'pol_nope'], policy(), 'PUT');
    expect(res.status).toBe(404);
  });

  it('refuses an account that cannot author policies', async () => {
    const target = store.targetingPolicies[0];
    const res = await call(
      ['targeting-policies', 'telco-uk', target.id],
      { name: 'x' },
      'PUT',
      SARAH()
    );
    expect(res.status).toBe(403);
  });
});
