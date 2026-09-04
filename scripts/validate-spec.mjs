#!/usr/bin/env node
/**
 * Structural checks on the OpenAPI spec, before anything is generated from it.
 *
 * This used to live as an inline heredoc in the CI workflow, which meant it was
 * unrunnable locally and only checked `$ref`s into `schemas` — parameter refs
 * were filtered out and silently ignored.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const spec = load(
  fs.readFileSync(path.join(root, 'docs/metis-api.openapi.yaml'), 'utf8')
);

const problems = [];

// --- Operations -------------------------------------------------------------

const METHODS = ['get', 'put', 'post', 'patch', 'delete'];
const operations = [];
for (const [pathname, item] of Object.entries(spec.paths)) {
  for (const method of METHODS) {
    const op = item[method];
    if (!op) continue;
    if (!op.operationId) {
      problems.push(`${method.toUpperCase()} ${pathname} has no operationId`);
      continue;
    }
    operations.push({ ...op, method, pathname });
  }
}

const ids = operations.map((o) => o.operationId);
const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i);
if (duplicates.length) {
  problems.push(`duplicate operationId: ${[...new Set(duplicates)].join(', ')}`);
}

// Every operation needs a 2xx, or the generated client has no response type.
for (const op of operations) {
  const success = Object.keys(op.responses ?? {}).find((c) => c.startsWith('2'));
  if (!success) {
    problems.push(`${op.operationId} declares no 2xx response`);
  }
}

// --- References -------------------------------------------------------------

const known = {
  schemas: new Set(Object.keys(spec.components.schemas ?? {})),
  parameters: new Set(Object.keys(spec.components.parameters ?? {})),
  responses: new Set(Object.keys(spec.components.responses ?? {})),
};

const refs = [];
JSON.stringify(spec, (key, value) => {
  if (key === '$ref' && typeof value === 'string') refs.push(value);
  return value;
});

for (const ref of new Set(refs)) {
  const m = /^#\/components\/(\w+)\/(.+)$/.exec(ref);
  if (!m) {
    problems.push(`only local component refs are supported: ${ref}`);
    continue;
  }
  const [, kind, name] = m;
  if (!known[kind]) {
    problems.push(`unknown component section in ref: ${ref}`);
  } else if (!known[kind].has(name)) {
    problems.push(`unresolved $ref: ${ref}`);
  }
}

// --- Dead weight ------------------------------------------------------------

// A schema nothing references is either a mistake or a leftover. Either way it
// generates a type nobody can reach.
const serialised = JSON.stringify(spec);
for (const name of known.schemas) {
  if (!serialised.includes(`#/components/schemas/${name}"`)) {
    problems.push(`schema "${name}" is never referenced`);
  }
}

// --- Every required property must exist -------------------------------------

// `required: [foo]` where `foo` is not in `properties` validates nothing, and
// is the easiest way to write a schema that can never be satisfied.
function checkRequired(schema, where) {
  if (!schema || typeof schema !== 'object') return;
  if (Array.isArray(schema.required) && schema.properties) {
    for (const name of schema.required) {
      if (!(name in schema.properties)) {
        problems.push(`${where}: required property "${name}" is not declared`);
      }
    }
  }
  for (const [key, value] of Object.entries(schema)) {
    if (value && typeof value === 'object') {
      checkRequired(value, `${where}.${key}`);
    }
  }
}
for (const [name, schema] of Object.entries(spec.components.schemas ?? {})) {
  checkRequired(schema, name);
}

// --- Report -----------------------------------------------------------------

if (problems.length) {
  console.error('OpenAPI spec problems:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}

const proposed = operations.filter((o) => o['x-metis-status'] === 'proposed');
console.log(
  `spec ok: ${Object.keys(spec.paths).length} paths, ${operations.length} operations ` +
    `(${operations.length - proposed.length} built, ${proposed.length} proposed), ` +
    `${known.schemas.size} schemas`
);
