import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import { REGISTRY, descriptorFor, USER_EDITABLE_ENTITIES, PENDING } from '../src/registry';
import {
  conditionHolds,
  isEnabled,
  layout,
  resolveOptions,
  slug,
  toFormState,
  toMajor,
  toMinor,
  toPayload,
  visibleFields,
  getPath,
  setPath,
} from '../src/codec';
import type { EntityDescriptor, FormState } from '../src';

/**
 * The drift check, and the codec's rules.
 *
 * A descriptor that has fallen behind its schema is worse than no descriptor:
 * the form renders, looks complete, and silently cannot edit the field that
 * was added. So the diff runs in both directions and names what is missing.
 */

const root = resolve(__dirname, '../../..');
const spec = load(readFileSync(resolve(root, 'docs/metis-api.openapi.yaml'), 'utf8')) as {
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
};

/** The first segment of every managed path: `financials.price` → `financials`. */
const managedRoots = (d: EntityDescriptor) =>
  new Set(d.fields.map((f) => f.field.split('.')[0]));

describe('every user-editable entity is accounted for', () => {
  it('is either registered or admitted as pending, never neither', () => {
    const missing = USER_EDITABLE_ENTITIES.filter((e) => !REGISTRY[e] && !PENDING[e]);
    expect(
      missing,
      'a user-editable entity with no descriptor and no stated reason. Declare one, or say in PENDING what stands in for it today.'
    ).toEqual([]);
  });

  it('is never both registered and pending', () => {
    const both = USER_EDITABLE_ENTITIES.filter((e) => REGISTRY[e] && PENDING[e]);
    expect(both, 'built, but still listed as pending').toEqual([]);
  });

  it('states a real reason for each pending entity', () => {
    for (const [entity, reason] of Object.entries(PENDING)) {
      expect(USER_EDITABLE_ENTITIES as readonly string[], `${entity} is not user-editable`).toContain(entity);
      expect(reason.length, `${entity} has no stated reason`).toBeGreaterThan(20);
    }
  });
});

describe('every descriptor matches its OpenAPI schema', () => {
  it('the spec parsed and has the schemas this test compares against', () => {
    // Without this, a moved spec would make every assertion below pass by
    // comparing two empty sets.
    expect(Object.keys(spec.components.schemas).length).toBeGreaterThan(20);
    expect(Object.keys(REGISTRY).length).toBeGreaterThan(0);
  });

  for (const [name, descriptor] of Object.entries(REGISTRY)) {
    describe(name, () => {
      const schema = spec.components.schemas[descriptor.entity];

      it('names a schema that exists', () => {
        expect(schema, `no schema '${descriptor.entity}' in the spec`).toBeDefined();
        expect(schema.properties).toBeDefined();
      });

      it('accounts for every schema property, as managed or unmanaged', () => {
        const managed = managedRoots(descriptor);
        const unmanaged = new Set(descriptor.unmanaged.map((u) => u.field));
        const missing = Object.keys(schema.properties ?? {}).filter(
          (p) => !managed.has(p) && !unmanaged.has(p)
        );
        expect(
          missing,
          'schema properties with no descriptor entry. Add a field, or add it to `unmanaged` with the reason it is not in the form.'
        ).toEqual([]);
      });

      it('declares no field the schema does not have', () => {
        const properties = new Set(Object.keys(schema.properties ?? {}));
        const stray = [...managedRoots(descriptor)].filter((f) => !properties.has(f));
        expect(stray, 'descriptor fields with no schema property').toEqual([]);
      });

      it('states a reason for every unmanaged property', () => {
        for (const u of descriptor.unmanaged) {
          expect(u.reason.length, `${u.field} has no stated reason`).toBeGreaterThan(15);
        }
      });

      it('does not both manage and disown the same property', () => {
        const managed = managedRoots(descriptor);
        const both = descriptor.unmanaged.filter((u) => managed.has(u.field));
        expect(both.map((b) => b.field)).toEqual([]);
      });

      it('puts every field in a declared group', () => {
        const groups = new Set(descriptor.groups.map((g) => g.key));
        const orphans = descriptor.fields.filter((f) => !groups.has(f.group));
        expect(orphans.map((f) => f.field)).toEqual([]);
      });

      it('orders fields unambiguously within each group', () => {
        for (const group of descriptor.groups) {
          const orders = descriptor.fields.filter((f) => f.group === group.key).map((f) => f.order);
          expect(new Set(orders).size, `duplicate order in group '${group.key}'`).toBe(orders.length);
        }
      });

      it('compiles every validation pattern', () => {
        for (const f of descriptor.fields) {
          if (f.validation?.pattern) expect(() => new RegExp(f.validation!.pattern!)).not.toThrow();
        }
      });

      it('points every condition and suggestion at a field that exists', () => {
        const known = new Set(descriptor.fields.map((f) => f.field));
        for (const f of descriptor.fields) {
          for (const c of [f.visibleWhen, f.enabledWhen]) {
            if (c) expect(known, `${f.field} conditions on ${c.field}`).toContain(c.field);
          }
          if (f.suggestFrom) expect(known).toContain(f.suggestFrom.field);
          if (f.derived) expect(known).toContain(f.derived.from);
        }
      });
    });
  }
});

describe('the Offer descriptor, exercised', () => {
  const offer = descriptorFor('Offer');
  const all: string[] = [];
  const sources = {
    'taxonomy.objectives': [
      { value: 'obj_acq', label: 'Acquisition' },
      { value: 'obj_ret', label: 'Retention' },
    ],
    'taxonomy.categories': [
      { value: 'cat_bb', label: 'Broadband', objectiveId: 'obj_acq' },
      { value: 'cat_save', label: 'Save', objectiveId: 'obj_ret' },
    ],
  };

  const record = {
    id: 'prop_x',
    name: 'Unlimited 5G',
    key: 'unlimited_5g',
    description: 'Fast',
    objectiveId: 'obj_acq',
    categoryId: 'cat_bb',
    boost: 1.2,
    tags: ['5g', 'hero'],
    financials: {
      price: { amount: 3500, currency: 'GBP' },
      cost: { amount: 1200, currency: 'GBP' },
      expectedMargin: { amount: 2300, currency: 'GBP' },
      termMonths: 24,
      oneOff: false,
    },
  };

  it('round-trips an entity through form state', () => {
    const form = toFormState(offer, record);
    expect(form['financials.price']).toBe('35.00');
    expect(form.tags).toBe('5g, hero');
    expect(form.boost).toBe('1.2');

    const body = toPayload(offer, form, { editing: true, permissions: all, entity: record });
    expect(body.financials).toMatchObject({
      price: { amount: 3500, currency: 'GBP' },
      termMonths: 24,
      oneOff: false,
    });
    expect(body.tags).toEqual(['5g', 'hero']);
    // Immutable after creation: the key appears in every decision record ever
    // written about this offer.
    expect(body).not.toHaveProperty('key');
  });

  it('sends the key when creating, and not when editing', () => {
    const form = toFormState(offer, record);
    const created = toPayload(offer, form, { editing: false, permissions: all });
    expect(created.key).toBe('unlimited_5g');
  });

  it('derives oneOff from the term rather than asking twice', () => {
    const form = { ...toFormState(offer, record), 'financials.termMonths': '0' };
    const body = toPayload(offer, form, { editing: false, permissions: all });
    expect(getPath(body, 'financials.oneOff')).toBe(true);
  });

  it('defaults the currency for a new entity and preserves it for an existing one', () => {
    const blank = toFormState(offer);
    const created = toPayload(offer, { ...blank, 'financials.price': '10' }, {
      editing: false,
      permissions: all,
    });
    expect(getPath(created, 'financials.price.currency')).toBe('GBP');

    const eur = { ...record, financials: { ...record.financials, price: { amount: 100, currency: 'EUR' } } };
    const kept = toPayload(offer, toFormState(offer, eur), {
      editing: true,
      permissions: all,
      entity: eur,
    });
    expect(getPath(kept, 'financials.price.currency')).toBe('EUR');
  });

  it('offers no category until an objective is chosen, then only that objective’s', () => {
    const category = offer.fields.find((f) => f.field === 'categoryId')!;
    const empty: FormState = { objectiveId: '' };
    expect(isEnabled(category, empty, false)).toBe(false);
    expect(resolveOptions(category, empty, sources)).toEqual([]);

    const chosen: FormState = { objectiveId: 'obj_ret' };
    expect(isEnabled(category, chosen, false)).toBe(true);
    expect(resolveOptions(category, chosen, sources).map((o) => o.value)).toEqual(['cat_save']);
  });

  it('locks the key on edit and leaves it open on create', () => {
    const key = offer.fields.find((f) => f.field === 'key')!;
    expect(isEnabled(key, {}, true)).toBe(false);
    expect(isEnabled(key, {}, false)).toBe(true);
  });

  it('groups the visible fields in declared order', () => {
    const blocks = layout(offer, toFormState(offer, record), all);

    // Structural rather than a literal list of group keys: adding a field is
    // meant to be a one-line change to the descriptor, and a test naming every
    // group makes it a two-file change for no gain. What matters is that the
    // order declared is the order rendered, and that nothing is orphaned.
    const declared = [...offer.groups].sort((a, b) => a.order - b.order).map((g) => g.key);
    expect(blocks.map((b) => b.group.key)).toEqual(
      declared.filter((k) => blocks.some((b) => b.group.key === k))
    );
    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(block.fields.every((f) => f.group === block.group.key)).toBe(true);
      const orders = block.fields.map((f) => f.order);
      expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    }

    expect(blocks[0].fields.map((f) => f.field)).toEqual(['name', 'key', 'description']);
  });

  it('never renders a derived field', () => {
    expect(visibleFields(offer, {}, all).map((f) => f.field)).not.toContain('financials.oneOff');
  });
});

describe('the codec rules', () => {
  it('reads and writes nested paths without mutating the source', () => {
    const source = { a: { b: 1 } };
    const body: Record<string, unknown> = { a: source.a };
    setPath(body, 'a.b', 2);
    expect(source.a.b, 'the entity behind the form was mutated').toBe(1);
    expect(getPath(body, 'a.b')).toBe(2);
  });

  it('converts money in both directions', () => {
    expect(toMajor(3500)).toBe('35.00');
    expect(toMinor('35.00')).toBe(3500);
    expect(toMinor('')).toBe(0);
    // Floating point: 19.99 * 100 is 1998.9999999999998 before rounding.
    expect(toMinor('19.99')).toBe(1999);
  });

  it('suggests a key from a name', () => {
    expect(slug('Speed Boost 100Mb')).toBe('speed_boost_100mb');
    expect(slug('  Leading & trailing  ')).toBe('leading_trailing');
  });

  it('evaluates each condition form', () => {
    expect(conditionHolds({ field: 'a', isSet: true }, { a: 'x' })).toBe(true);
    expect(conditionHolds({ field: 'a', isSet: true }, { a: '' })).toBe(false);
    expect(conditionHolds({ field: 'a', equals: 'x' }, { a: 'x' })).toBe(true);
    expect(conditionHolds({ field: 'a', oneOf: ['x', 'y'] }, { a: 'y' })).toBe(true);
    expect(conditionHolds({ field: 'a', oneOf: ['x'] }, { a: 'z' })).toBe(false);
    expect(conditionHolds(undefined, {})).toBe(true);
  });

  it('hides a field the person lacks the permission for, and drops it from the payload', () => {
    const gated: EntityDescriptor = {
      ...descriptorFor('Offer'),
      fields: [
        {
          field: 'boost',
          type: 'number',
          label: 'Boost',
          group: 'ranking',
          order: 10,
          permission: 'edit:arbitration',
        },
      ],
    };
    expect(visibleFields(gated, {}, [])).toEqual([]);
    expect(toPayload(gated, { boost: '9' }, { editing: false, permissions: [] })).toEqual({});
    expect(toPayload(gated, { boost: '9' }, { editing: false, permissions: ['edit:arbitration'] })).toEqual({
      boost: 9,
    });
  });
});
