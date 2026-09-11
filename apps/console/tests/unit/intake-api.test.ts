import { describe, it, expect, beforeEach } from 'vitest';
import { GET, POST, PUT } from '@/app/api/[...path]/route';
import { store, resetStore } from '@/mocks/store';

/**
 * The intake pipeline over HTTP.
 *
 * The core arithmetic is covered in `packages/core`. What is covered here is
 * the ordering, which is the whole reason the pipeline has four stages rather
 * than one form: a verdict must describe the rows and the mapping that are
 * actually held, and activation must be unreachable without a clean one.
 */

const AUTH = (email: string) => {
  const u = store.users.find((x) => x.email === email);
  if (!u) throw new Error(`no fixture user ${email}`);
  return { authorization: `Bearer metis.${u.id}`, 'content-type': 'application/json' };
};
/** Has edit:integrations. */
const MARCUS = () => AUTH('marcus.webb@telco.example');
/** Does not. */
const SARAH = () => AUTH('sarah.chen@telco.example');

const call = (
  path: string[],
  body?: unknown,
  method: 'GET' | 'POST' | 'PUT' = 'POST',
  headers = MARCUS()
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

const ROWS = [
  { cust_id: 'c1', dob: '1990-01-15', band: 'A', standing: 'active', plan: 'standard', fibre: 'Y' },
  { cust_id: 'c2', dob: '1985-06-01', band: 'A', standing: 'active', plan: 'standard', fibre: 'N' },
];

/**
 * Enough to fill every field the model marks required.
 *
 * The seeded model requires five, and a partial mapping is refused at
 * activation — which is what `refuses one that cannot fill a required field`
 * covers, using `PARTIAL` below.
 */
const MAPPINGS = [
  { column: 'dob', path: 'customer.age', transform: { kind: 'years_since' } },
  {
    column: 'band',
    path: 'customer.credit_status',
    transform: { kind: 'map_values', values: { A: 'pass', D: 'fail' } },
  },
  { column: 'standing', path: 'customer.account_status' },
  { column: 'plan', path: 'customer.current_plan' },
  { column: 'fibre', path: 'customer.address.fibre_available', transform: { kind: 'to_boolean' } },
];

/** Fills two of the five, so activation must refuse it. */
const PARTIAL = [MAPPINGS[0], MAPPINGS[1]];

async function newSource() {
  const res = await call(['data-sources', 'telco-uk'], {
    name: 'CRM nightly',
    description: 'Overnight export.',
    kind: 'file',
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; status: string };
}

const land = (id: string, rows: unknown[], replace = true) =>
  call(['data-sources', 'telco-uk', id, 'rows'], { rows, replace });
const map = (id: string, mappings: unknown[]) =>
  call(['data-sources', 'telco-uk', id], { mappings }, 'PUT');
const validate = (id: string) => call(['data-sources', 'telco-uk', id, 'validation'], {});
const activate = (id: string) => call(['data-sources', 'telco-uk', id, 'activation'], {});

describe('landing', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('observes the columns without interpreting them', async () => {
    // Which column means what is the mapping's job. Keeping the two apart is
    // why a source that changes shape shows up as an unmapped column rather
    // than as silently absent data.
    const { id } = await newSource();
    const res = await land(id, ROWS);
    const source = (await res.json()) as { columns: string[]; landedRows: number };

    expect(res.status).toBe(200);
    expect(source.columns).toEqual([
      'band',
      'cust_id',
      'dob',
      'fibre',
      'plan',
      'standing',
    ]);
    expect(source.landedRows).toBe(2);
  });

  it('appends or replaces as asked', async () => {
    const { id } = await newSource();
    await land(id, ROWS);
    await land(id, [{ cust_id: 'c3', dob: '2000-01-01', band: 'A' }], false);
    const res = await call(['data-sources', 'telco-uk'], undefined, 'GET');
    const { sources } = (await res.json()) as { sources: { landedRows: number }[] };
    expect(sources[0].landedRows).toBe(3);
  });

  it('refuses an account without edit:integrations', async () => {
    const { id } = await newSource();
    const res = await call(
      ['data-sources', 'telco-uk', id, 'rows'],
      { rows: ROWS },
      'POST',
      SARAH()
    );
    expect(res.status).toBe(403);
  });
});

describe('a verdict describes what is actually held', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('validates the landed rows against the model', async () => {
    const { id } = await newSource();
    await land(id, ROWS);
    await map(id, MAPPINGS);

    const res = await validate(id);
    const { source, report } = (await res.json()) as {
      source: { status: string };
      report: { rows: number; clean: number; errors: number };
    };

    expect(report.rows).toBe(2);
    expect(report.clean).toBe(2);
    expect(report.errors).toBe(0);
    expect(source.status).toBe('validated');
  });

  it('reports the column that fails, with an example', async () => {
    const { id } = await newSource();
    await land(id, [...ROWS, { cust_id: 'c9', dob: '1990-01-01', band: 'Z' }]);
    await map(id, MAPPINGS);

    const { report } = (await (await validate(id)).json()) as {
      report: { errors: number; columns: { column: string; failed: number; examples: string[] }[] };
    };

    expect(report.errors).toBe(1);
    const band = report.columns.find((c) => c.column === 'band')!;
    expect(band.failed).toBe(1);
    expect(band.examples[0]).toContain("'Z' is not in the mapping");
  });

  it('sends the source back to draft when new rows land', async () => {
    // Rows that arrived after a verdict were not the rows the verdict was
    // about. Keeping `validated` would let unexamined data through the gate.
    const { id } = await newSource();
    await land(id, ROWS);
    await map(id, MAPPINGS);
    await validate(id);

    const after = (await (await land(id, [{ dob: 'nonsense' }])).json()) as { status: string };
    expect(after.status).toBe('draft');
  });

  it('sends the source back to draft when the mapping changes', async () => {
    // Same reason from the other side: the verdict was about a different
    // mapping, so an edit must not inherit it.
    const { id } = await newSource();
    await land(id, ROWS);
    await map(id, MAPPINGS);
    await validate(id);

    const after = (await (await map(id, PARTIAL)).json()) as { status: string };
    expect(after.status).toBe('draft');
  });
});

describe('activation', () => {
  beforeEach(async () => {
    await resetStore();
  });

  it('goes live when the last validation was clean', async () => {
    const { id } = await newSource();
    await land(id, ROWS);
    await map(id, MAPPINGS);
    await validate(id);

    const res = await activate(id);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('active');
  });

  it('refuses a source that was never validated, and says so', async () => {
    const { id } = await newSource();
    await land(id, ROWS);
    await map(id, MAPPINGS);

    const res = await activate(id);
    const body = (await res.json()) as { error: string; problems: string[] };

    expect(res.status).toBe(409);
    expect(body.error).toBe('not_activatable');
    expect(body.problems).toContain('This source has not been validated.');
  });

  it('refuses one whose validation found errors', async () => {
    // The point of landing and mapping first is to fail before anything reads
    // the data. Activating over known-bad columns skips both stages.
    const { id } = await newSource();
    await land(id, [{ dob: 'not a date', band: 'A' }]);
    await map(id, MAPPINGS);
    await validate(id);

    const res = await activate(id);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { problems: string[] }).problems.join(' ')).toContain(
      'do not satisfy the model'
    );
  });

  it('refuses one that cannot fill a required field', async () => {
    const { id } = await newSource();
    await land(id, ROWS);
    await map(id, PARTIAL);
    await validate(id);

    const res = await activate(id);
    // Three of the five are unfilled; the message names them so the fix is
    // adding mappings rather than guessing.
    expect(((await res.json()) as { problems: string[] }).problems.join(' ')).toContain(
      'customer.account_status'
    );
  });

  it('cannot be reached by re-validating after a bad landing', async () => {
    // The ordering property, end to end: land clean, validate, land bad,
    // activate. The second landing must invalidate the first verdict.
    const { id } = await newSource();
    await land(id, ROWS);
    await map(id, MAPPINGS);
    await validate(id);
    await land(id, [{ dob: 'not a date', band: 'A' }]);

    const res = await activate(id);
    expect(res.status).toBe(409);
  });

  it('refuses an account without edit:integrations', async () => {
    const { id } = await newSource();
    const res = await call(['data-sources', 'telco-uk', id, 'activation'], {}, 'POST', SARAH());
    expect(res.status).toBe(403);
  });

  it('records who activated it', async () => {
    const { id } = await newSource();
    await land(id, ROWS);
    await map(id, MAPPINGS);
    await validate(id);
    await activate(id);

    const event = store.auditEvents[0];
    expect(event.eventType).toBe('DataSourceActivated');
    expect(event.actor).toBe('marcus.webb@telco.example');
  });
});
