#!/usr/bin/env node
/**
 * Generate the API client from the OpenAPI spec.
 *
 * Run: npm run generate -w @metis/client
 *
 * The output is committed, and CI re-runs this and fails on a diff. That is
 * what makes the spec load-bearing: you cannot change the shape of the API
 * without the change appearing in a reviewed file, and you cannot change the
 * generated file without the spec agreeing.
 *
 * Deliberately not a library. Reading the spec and emitting TypeScript is ~200
 * lines; a generator dependency would be a larger surface than the thing it
 * generates, and this way the emitted code stays something a person can read.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
const SPEC = path.resolve(here, '../../docs/metis-api.openapi.yaml');
const OUT = path.resolve(here, 'src/generated.ts');

const spec = yaml.load(fs.readFileSync(SPEC, 'utf8'));

// --- Types ------------------------------------------------------------------

/** A $ref to a named schema becomes a reference to the emitted interface. */
function refName(ref) {
  const m = /^#\/components\/schemas\/(.+)$/.exec(ref);
  if (!m) throw new Error(`Only local schema refs are supported, got: ${ref}`);
  return m[1];
}

function tsType(schema, indent = 0) {
  if (!schema) return 'unknown';
  if (schema.$ref) return refName(schema.$ref);

  // An empty schema ({}) is deliberate: "any JSON value here".
  if (Object.keys(schema).length === 0) return 'unknown';

  if (Array.isArray(schema.enum)) {
    return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  }

  // OpenAPI 3.1 nullability: `type: [string, 'null']`.
  if (Array.isArray(schema.type)) {
    return schema.type
      .map((t) => tsType({ ...schema, type: t }, indent))
      .join(' | ');
  }
  if (schema.type === 'null') return 'null';

  // 3.1 spells "this or null" as a oneOf when the non-null branch is a $ref.
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.map((s) => wrap(tsType(s, indent))).join(' | ');
  }
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.map((s) => wrap(tsType(s, indent))).join(' | ');
  }

  switch (schema.type) {
    case 'string':
      return 'string';
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'array':
      return `${wrap(tsType(schema.items, indent))}[]`;
    case 'object':
      return objectType(schema, indent);
    default:
      // A schema with properties but no declared type is still an object.
      return schema.properties ? objectType(schema, indent) : 'unknown';
  }
}

/** Parenthesise unions so `A | B[]` does not mean `A | (B[])` by accident. */
function wrap(t) {
  return t.includes('|') ? `(${t})` : t;
}

function objectType(schema, indent) {
  const props = schema.properties;
  if (!props || Object.keys(props).length === 0) {
    // A free-form object may still constrain its values.
    const values = schema.additionalProperties;
    return values && typeof values === 'object'
      ? `Record<string, ${tsType(values, indent)}>`
      : 'Record<string, unknown>';
  }

  const required = new Set(schema.required ?? []);
  const pad = '  '.repeat(indent + 1);
  const lines = Object.entries(props).map(([name, sub]) => {
    const doc = sub.description ? `${pad}/** ${sub.description} */\n` : '';
    const optional = required.has(name) ? '' : '?';
    return `${doc}${pad}${safeKey(name)}${optional}: ${tsType(sub, indent + 1)};`;
  });
  return `{\n${lines.join('\n')}\n${'  '.repeat(indent)}}`;
}

function safeKey(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}

// --- Operations -------------------------------------------------------------

const METHODS = ['get', 'put', 'post', 'patch', 'delete'];

/** Shared parameters are declared once under components and referenced. */
function resolveParam(p) {
  if (!p.$ref) return p;
  const m = /^#\/components\/parameters\/(.+)$/.exec(p.$ref);
  if (!m) throw new Error(`Unsupported parameter ref: ${p.$ref}`);
  const resolved = spec.components.parameters?.[m[1]];
  if (!resolved) throw new Error(`Parameter not found: ${p.$ref}`);
  return resolved;
}

function operations() {
  const out = [];
  for (const [pathname, item] of Object.entries(spec.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op?.operationId) continue;

      const params = [...(item.parameters ?? []), ...(op.parameters ?? [])].map(
        resolveParam
      );
      out.push({
        id: op.operationId,
        method: method.toUpperCase(),
        path: pathname,
        summary: op.summary,
        pathParams: params.filter((p) => p.in === 'path').map((p) => p.name),
        queryParams: params.filter((p) => p.in === 'query').map((p) => p.name),
        requestSchema: op.requestBody?.content?.['application/json']?.schema,
        // The success response is whichever 2xx the operation declares.
        responseSchema: successResponse(op),
        statuses: Object.keys(op.responses ?? {}),
      });
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

function successResponse(op) {
  const code = Object.keys(op.responses ?? {}).find((c) => c.startsWith('2'));
  if (!code) return undefined;
  return op.responses[code].content?.['application/json']?.schema;
}

// --- Emit -------------------------------------------------------------------

const ops = operations();

const parts = [];
parts.push(`/**
 * GENERATED FROM docs/metis-api.openapi.yaml — DO NOT EDIT.
 *
 * Regenerate with:  npm run generate -w @metis/client
 *
 * Spec version ${spec.info.version}. CI fails if this file and the spec disagree,
 * so an edit here is reverted by the next build; change the spec instead.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
`);

parts.push('// --- Schemas ----------------------------------------------------------------\n');
for (const [name, schema] of Object.entries(spec.components.schemas)) {
  if (schema.description) parts.push(`/** ${schema.description} */`);
  parts.push(`export interface ${name} ${objectType(schema, 0)}\n`);
}

parts.push('// --- Operations -------------------------------------------------------------\n');
parts.push(`/** Every operation the spec declares, keyed by operationId. */
export const OPERATIONS = {`);
for (const op of ops) {
  parts.push(`  ${op.id}: {
    method: '${op.method}',
    path: '${op.path}',
    pathParams: [${op.pathParams.map((p) => `'${p}'`).join(', ')}],
    queryParams: [${op.queryParams.map((p) => `'${p}'`).join(', ')}],
    statuses: [${op.statuses.map((s) => `'${s}'`).join(', ')}],
  },`);
}
parts.push('} as const;\n');

parts.push(`export type OperationId = keyof typeof OPERATIONS;\n`);

parts.push('// --- Request and response bodies --------------------------------------------\n');
for (const op of ops) {
  const req = op.requestSchema ? tsType(op.requestSchema, 0) : 'never';
  const res = op.responseSchema ? tsType(op.responseSchema, 0) : 'void';
  if (op.summary) parts.push(`/** ${op.summary} */`);
  parts.push(`export type ${cap(op.id)}Response = ${res};`);
  if (op.requestSchema) parts.push(`export type ${cap(op.id)}Request = ${req};`);
  parts.push('');
}

parts.push(`/** Response body type for each operation, by id. */
export interface ResponseOf {`);
for (const op of ops) parts.push(`  ${op.id}: ${cap(op.id)}Response;`);
parts.push('}\n');

function cap(s) {
  return s[0].toUpperCase() + s.slice(1);
}

fs.writeFileSync(OUT, parts.join('\n').replace(/\n{3,}/g, '\n\n'), 'utf8');
process.stdout.write(
  `Generated ${path.relative(process.cwd(), OUT)}: ` +
    `${Object.keys(spec.components.schemas).length} schemas, ${ops.length} operations.\n`
);
