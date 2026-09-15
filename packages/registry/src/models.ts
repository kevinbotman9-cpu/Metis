import { createHash } from 'node:crypto';
import type { ModelVersion } from '@metis/core/domain';

/**
 * Model versions: what a publish checks, and what makes two the same. ADR-009 §4.
 *
 * Kept apart from `registry.ts` because none of it is about flows. The rules a
 * flow version follows — compile first, bind the version to its content, refuse
 * different content under a published version — are the same rules here, with
 * the compiler's place taken by the checks below. A model has no graph to
 * compile; what can be wrong with one is what it declares.
 */

/** What a caller supplies. The registry stamps who and when. */
export type ModelDeclaration = Omit<ModelVersion, 'tenantId' | 'publishedAt' | 'publishedBy'>;

/** One thing wrong with a declaration, on the field it is about. */
export interface ModelProblem {
  field: string;
  message: string;
}

const KINDS = new Set(['propensity', 'value', 'ranking']);
const FEATURE_TYPES = new Set(['string', 'integer', 'decimal', 'boolean', 'timestamp', 'enum', 'money']);
const EXACT_VERSION = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ID = /^[a-z0-9][a-z0-9_-]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/;

/**
 * Everything wrong with a declaration. Empty means it may be published.
 *
 * Every problem at once, so somebody filling in a form learns all of it from one
 * attempt. Whether a feature path exists in the tenant's data model is not
 * checked here: the registry does not hold the schema, and a model is published
 * once and compiled against many schema versions. The compiler checks the path
 * where it is used (ADR-009 §5).
 */
export function modelProblems(d: Partial<ModelDeclaration>): ModelProblem[] {
  const problems: ModelProblem[] = [];
  const text = (v: unknown) => typeof v === 'string' && v.trim() !== '';

  if (!text(d.id) || !ID.test(d.id!)) {
    problems.push({ field: 'id', message: 'An id is lower case letters, digits, underscores and hyphens, starting with a letter or digit.' });
  }
  if (!text(d.version) || !EXACT_VERSION.test(d.version!)) {
    problems.push({ field: 'version', message: 'Pin an exact version such as 4.2.0. A floating version would change the answer on replay.' });
  }
  if (!text(d.name)) problems.push({ field: 'name', message: 'A model needs a name.' });
  if (!KINDS.has(d.kind as string)) {
    problems.push({ field: 'kind', message: "Kind is one of 'propensity', 'value' or 'ranking'." });
  }
  if (typeof d.declaredP95Ms !== 'number' || !Number.isFinite(d.declaredP95Ms) || d.declaredP95Ms <= 0) {
    problems.push({
      field: 'declaredP95Ms',
      message: 'Declare a p95 above zero, in milliseconds. It joins the critical path, so a scorer with no declared cost would be budgeted as free.',
    });
  }
  if (!text(d.owner)) {
    problems.push({ field: 'owner', message: 'Name who answers for this scorer. Erasure obligations attach to whoever trained it.' });
  }
  if (!text(d.weightsHash) || !SHA256.test(d.weightsHash!)) {
    problems.push({ field: 'weightsHash', message: 'The weights hash is a sha256: 64 lower-case hexadecimal characters.' });
  }
  if (!text(d.trainedThrough) || !DATE.test(d.trainedThrough!) || Number.isNaN(Date.parse(`${d.trainedThrough}T00:00:00Z`))) {
    problems.push({
      field: 'trainedThrough',
      message: 'Declare the last date of the training data as YYYY-MM-DD. It is what makes an erasure request answerable.',
    });
  }

  if (!Array.isArray(d.features)) {
    problems.push({ field: 'features', message: 'Declare the features as a list, empty if the model reads none.' });
  } else {
    const seen = new Set<string>();
    d.features.forEach((f, i) => {
      if (!f || typeof f.path !== 'string' || !PATH.test(f.path)) {
        problems.push({ field: `features.${i}.path`, message: `Feature ${i + 1} needs a dotted path into the data model, such as customer.tenureMonths.` });
      } else if (seen.has(f.path)) {
        problems.push({ field: `features.${i}.path`, message: `'${f.path}' is declared twice.` });
      } else {
        seen.add(f.path);
      }
      if (!f || !FEATURE_TYPES.has(f.type as string)) {
        problems.push({ field: `features.${i}.type`, message: `Feature ${i + 1} needs a type the data model has.` });
      }
    });
  }
  return problems;
}

/**
 * What publishing a model version did.
 *
 * The flow outcomes' shape, with the compiler's diagnostics replaced by the
 * declaration's problems: nothing is stored on a refusal of either kind.
 */
export type ModelPublishOutcome =
  | { status: 'published'; model: ModelVersion }
  /** Identical content already published under this version. Nothing changed. */
  | { status: 'unchanged'; model: ModelVersion }
  | { status: 'rejected'; reason: 'invalid'; problems: ModelProblem[] }
  /** The version exists and declares something else. */
  | {
      status: 'rejected';
      reason: 'immutable';
      problems: ModelProblem[];
      existingHash: string;
      attemptedHash: string;
    };

/**
 * The version to store: exactly the declared fields, stamped.
 *
 * Built field by field rather than spread, so a caller cannot put a tenant, an
 * author or anything undeclared into a published version by sending it.
 */
export function modelVersionOf(
  d: ModelDeclaration,
  tenantId: string,
  actor: string,
  occurredAt: string
): ModelVersion {
  return {
    tenantId,
    id: d.id,
    version: d.version,
    name: d.name,
    description: d.description ?? '',
    kind: d.kind,
    features: d.features.map((f) => ({ path: f.path, type: f.type })),
    declaredP95Ms: d.declaredP95Ms,
    owner: d.owner,
    weightsHash: d.weightsHash,
    trainedThrough: d.trainedThrough,
    publishedAt: occurredAt,
    publishedBy: actor,
  };
}

/** Exact versions compared numerically, so 4.10.0 is newer than 4.2.0. */
export function compareVersions(a: string, b: string): number {
  const [am = 0, an = 0, ap = 0] = a.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const [bm = 0, bn = 0, bp = 0] = b.split('.').map((p) => Number.parseInt(p, 10) || 0);
  return am - bm || an - bn || ap - bp;
}

/**
 * sha256 over what a version declares, key-sorted.
 *
 * Who published it and when are not content: republishing identical content
 * later, or as somebody else, is the same version and a no-op.
 */
export function modelContentHash(v: ModelDeclaration): string {
  const content: ModelDeclaration = {
    id: v.id,
    version: v.version,
    name: v.name,
    description: v.description ?? '',
    kind: v.kind,
    features: v.features.map((f) => ({ path: f.path, type: f.type })),
    declaredP95Ms: v.declaredP95Ms,
    owner: v.owner,
    weightsHash: v.weightsHash,
    trainedThrough: v.trainedThrough,
  };
  return createHash('sha256').update(stableStringify(content), 'utf8').digest('hex');
}

/** Key-sorted JSON, so the hash does not depend on property order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}
