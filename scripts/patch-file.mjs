#!/usr/bin/env node
/**
 * Exact-match text patching that survives CRLF.
 *
 * Most files in this repository are checked out with CRLF endings — `git
 * config core.autocrlf` is `true` on the machines it is written on, and CI is
 * Linux. So a patch written by hand with `\n` in the pattern does not match,
 * and the ways it fails are all quiet:
 *
 * - the replacement silently does not apply, and a script that does not assert
 *   reports success;
 * - a blanket `content.replace('\n', '\r\n')` on the pattern corrupts any
 *   *escape sequence* in it, so patching a line containing `.split('\n')`
 *   rewrites the source's two-character `\` + `n` into a real line break;
 * - a `\` line-continuation followed by CR is not a continuation to any shell,
 *   so a patched YAML or bash block changes meaning rather than failing.
 *
 * All three happened in one session on 2026-09-10 — in the storefront, in a
 * workflow's gate step, and in three test files — which is why this exists.
 * Rule 10 in CLAUDE.md was phrased about *reading* files; every instance was on
 * the writing side.
 *
 * The fix is to never let the pattern and the file disagree about endings:
 * normalise the file to `\n`, patch it with plain `\n` patterns, restore the
 * endings the file had. Escape sequences inside the text are untouched, because
 * nothing rewrites the pattern.
 *
 * Usage, as a module:
 *
 *   import { patchFile } from './scripts/patch-file.mjs';
 *   patchFile('docs/gaps.md', [[oldText, newText]]);
 *
 * or from the shell, reading the pair from two files so no quoting is involved:
 *
 *   node scripts/patch-file.mjs <target> <old-file> <new-file>
 *
 * Every replacement is asserted and applied once. A pattern that does not match
 * throws and names the file, because the failure mode this guards against is
 * precisely a patch that quietly does nothing.
 */

import fs from 'node:fs';

/**
 * Apply `[old, new]` pairs to a file, once each, preserving its line endings.
 *
 * @param {string} file
 * @param {Array<[string, string]>} pairs Patterns with `\n` newlines.
 * @returns {number} how many replacements were applied
 */
export function patchFile(file, pairs) {
  const raw = fs.readFileSync(file, 'utf8');
  const crlf = raw.includes('\r\n');
  let text = raw.split('\r\n').join('\n');

  for (const [oldText, newText] of pairs) {
    const needle = oldText.split('\r\n').join('\n');
    if (!text.includes(needle)) {
      throw new Error(
        `patch-file: no match in ${file} for:\n${needle.slice(0, 200)}${needle.length > 200 ? '…' : ''}`
      );
    }
    // `indexOf`/`slice` rather than `String.replace`, which treats `$&` and
    // friends in the replacement as substitutions — a real hazard when the new
    // text is source code or a regular expression.
    const at = text.indexOf(needle);
    text = text.slice(0, at) + newText.split('\r\n').join('\n') + text.slice(at + needle.length);
  }

  fs.writeFileSync(file, crlf ? text.split('\n').join('\r\n') : text, 'utf8');
  return pairs.length;
}

// --- CLI -------------------------------------------------------------------

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  const [target, oldFile, newFile] = process.argv.slice(2);
  if (!target || !oldFile || !newFile) {
    console.error('usage: node scripts/patch-file.mjs <target> <old-file> <new-file>');
    process.exit(2);
  }
  patchFile(target, [[fs.readFileSync(oldFile, 'utf8'), fs.readFileSync(newFile, 'utf8')]]);
  console.log(`patched ${target}`);
}
