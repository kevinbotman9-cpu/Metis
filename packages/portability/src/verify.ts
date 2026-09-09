import { hash } from '@metis/runtime/deterministic/canonical';
import { EXPORTED_ENTITIES } from './entities';
import { FORMAT_VERSION, type BundleProblem, type TenantBundle } from './types';

/**
 * Is this bundle what it says it is?
 *
 * The conformance utility §9 asks for. It answers three questions, and the
 * order matters: a bundle from an unreadable format version is not worth
 * hashing, and a bundle with a missing file is not worth comparing row counts
 * on.
 *
 * Every problem found is returned rather than thrown one at a time. Someone
 * handed a bad bundle wants to know everything wrong with it, not to discover
 * the next fault after fixing the first.
 */
export function verifyBundle(bundle: TenantBundle): BundleProblem[] {
  const problems: BundleProblem[] = [];
  const m = bundle.manifest;

  // Major version only: a bundle written by a newer minor is expected to be
  // readable, and one written by a newer major is not. Refusing outright is
  // the point — a partial import is invisible in a way a refusal is not.
  const [major] = (m.formatVersion ?? '').split('.');
  const [ourMajor] = FORMAT_VERSION.split('.');
  if (!m.formatVersion || major !== ourMajor) {
    problems.push({
      kind: 'format-version',
      message:
        `Bundle format ${m.formatVersion || '(absent)'} cannot be read by ` +
        `${FORMAT_VERSION}. Importing the parts that happen to parse would ` +
        'leave a tenant half-populated and looking complete.',
    });
    return problems;
  }

  const declared = new Map(m.files.map((f) => [f.entity, f]));

  for (const entity of EXPORTED_ENTITIES) {
    const file = declared.get(entity);
    if (!file) {
      problems.push({
        kind: 'missing-entity',
        message: `Manifest declares no ${entity}. This export is not complete.`,
      });
      continue;
    }

    const rows = bundle[entity];
    if (rows.length !== file.count) {
      problems.push({
        kind: 'count',
        message: `${entity}: manifest says ${file.count} rows, bundle holds ${rows.length}.`,
      });
    }

    const actual = hash(rows);
    if (actual !== file.sha256) {
      problems.push({
        kind: 'file-hash',
        message:
          `${entity}: content hash ${actual.slice(0, 16)} does not match the ` +
          `manifest's ${file.sha256.slice(0, 16)}. The rows have been altered ` +
          'since export.',
      });
    }
  }

  for (const file of m.files) {
    if (!EXPORTED_ENTITIES.includes(file.entity)) {
      problems.push({
        kind: 'unknown-entity',
        message:
          `Manifest declares ${file.entity}, which this version does not know ` +
          'how to import. Refusing rather than dropping it silently.',
      });
    }
  }

  const bundleHash = hash(m.files);
  if (bundleHash !== m.bundleHash) {
    problems.push({
      kind: 'bundle-hash',
      message:
        `Bundle hash ${bundleHash.slice(0, 16)} does not match the manifest's ` +
        `${m.bundleHash.slice(0, 16)}. The manifest itself has been edited.`,
    });
  }

  return problems;
}
