/**
 * Contrast ratios in the token layer, measured rather than asserted.
 *
 * `apps/console/app/globals.css` carries claims like "n-500 measured 4.29:1 on
 * white and 3.75:1 on sunken, so the ramp starts one step darker" and "White
 * measures 13.5:1 on the burgundy end". They were computed by hand, and one of
 * them is already stale: the header comment still describes a burgundy band
 * that a later recolour replaced with teal. A number nobody recomputes is a
 * number that goes wrong quietly.
 *
 * The axe sweep catches contrast on pairs that actually render, on the routes
 * it visits, in the two themes it drives. That is most of them and not all of
 * them: it has no rule for focus-indicator contrast, it never sees a token pair
 * that only appears in a state nothing exercised, and it tells you a page
 * failed rather than which token to change. This reads the source of truth
 * instead, so a palette edit is checked before it is rendered.
 *
 * Zero dependencies and a regex rather than a CSS parser: the format is
 * `--name: r g b;` and ten auditable lines beat a dependency that could parse
 * anything.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const CSS_PATH = resolve(HERE, '../apps/console/app/globals.css');

// --- the arithmetic -------------------------------------------------------

/** WCAG 2.x relative luminance. The 0.03928 knee is the sRGB transfer curve. */
function luminance([r, g, b]) {
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Composite a foreground over a background at a given alpha.
 *
 * The console writes `text-rail-fg/80` and `bg-on-brand/70`; what the eye gets
 * is the blend, and the blend is what has to clear the threshold. Checking the
 * unblended token would pass while the rendered text failed.
 */
export function over(fg, bg, alpha) {
  return fg.map((c, i) => Math.round(c * alpha + bg[i] * (1 - alpha)));
}

// --- reading the tokens ---------------------------------------------------

/**
 * Pull one `:root`-ish block out of the stylesheet by its selector.
 *
 * Brace-counted rather than matched to the first `}`, because the blocks
 * contain no nested rules today and a naive match would still be a trap for
 * whoever adds one.
 */
function block(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`check-contrast: no ${selector} block in globals.css`);

  let depth = 0;
  let i = css.indexOf('{', start);
  const open = i;
  for (; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`check-contrast: unterminated ${selector} block`);
}

/**
 * Declarations in one block, with `var(--x)` aliases resolved.
 *
 * Resolution is the whole job. Most semantic tokens are aliases — `--page` is
 * `var(--n-100)`, `--text` is `var(--n-900)` — so a parser that read only
 * literals would skip nearly everything worth checking and report a confident
 * green over a handful of ramp steps.
 */
function declarations(source, inherited = {}) {
  const raw = { ...inherited };
  for (const [, name, value] of source.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    raw[name] = value.trim();
  }

  const resolved = {};
  const resolve1 = (name, seen = new Set()) => {
    if (name in resolved) return resolved[name];
    if (seen.has(name)) throw new Error(`check-contrast: --${name} resolves to itself`);
    seen.add(name);

    const value = raw[name];
    if (value === undefined) return undefined;

    const alias = value.match(/^var\(--([\w-]+)\)$/);
    if (alias) {
      const target = resolve1(alias[1], seen);
      if (target) resolved[name] = target;
      return target;
    }

    const channels = value.split(/\s+/).map(Number);
    if (channels.length === 3 && channels.every((c) => Number.isInteger(c) && c >= 0 && c <= 255)) {
      resolved[name] = channels;
      return channels;
    }
    // Not a colour — a radius, a shadow, a font stack. Ignored, not an error.
    return undefined;
  };

  for (const name of Object.keys(raw)) resolve1(name);
  return resolved;
}

/**
 * Comments out, before anything looks for a declaration.
 *
 * Learned the hard way: a comment reading "Lighter than --accent: ..." matched
 * the declaration regex, and `[^;]+` then ran greedily past the end of the
 * comment and swallowed the real `--rail-accent` after it. The token vanished
 * from the checks and the script reported it missing rather than wrong — which
 * is at least the right failure, but only because missing tokens are treated as
 * broken assertions.
 */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

export function parseTokens(rawCss = readFileSync(CSS_PATH, 'utf8')) {
  const css = stripComments(rawCss);
  const light = declarations(block(css, ':root {'));
  // Dark re-declares part of the ramp and inherits the rest, exactly as the
  // cascade does. Seeding with light is what makes an un-redeclared token
  // resolve rather than silently drop out of the checks.
  const dark = declarations(block(css, ":root[data-theme='dark']"), {
    ...Object.fromEntries(Object.entries(light).map(([k, v]) => [k, v.join(' ')])),
  });
  return { light, dark };
}

// --- what must hold -------------------------------------------------------

const AA_TEXT = 4.5;
const AA_LARGE = 3;

const SURFACES = ['surface', 'surface-raised', 'surface-sunken', 'page'];

/**
 * The pairs, as data.
 *
 * `required` fails the build. `known` is reported and does not, because two of
 * them fail today: the autonomy ladder renders `bg-lN/12 text-lN`, a token as
 * text over a 12% tint of itself, and L3 measures 4.37 on the sunken surface
 * before anything in this palette moves. Tiering says so out loud instead of
 * either blocking unrelated work or pretending it is fine.
 */
export const PAIRS = [
  ...['text', 'text-muted', 'text-subtle'].flatMap((fg) =>
    SURFACES.map((bg) => ({ fg, bg, min: AA_TEXT, why: 'body and label text' }))
  ),
  ...['accent', 'accent-hover', 'pass', 'block', 'hold', 'info'].flatMap((fg) =>
    ['surface', 'surface-sunken', 'page'].map((bg) => ({
      fg,
      bg,
      min: AA_TEXT,
      why: 'state and interactive text',
    }))
  ),
  // The chip pattern: a state colour as text on its own tint.
  ...['accent', 'pass', 'block', 'hold', 'info'].map((fg) => ({
    fg,
    bg: `${fg}-subtle`,
    min: AA_TEXT,
    why: 'badge: token on its own tint',
  })),
  { fg: 'on-accent', bg: 'accent', min: AA_TEXT, why: 'text on a filled button' },
  { fg: 'on-block', bg: 'block', min: AA_TEXT, why: 'text on a destructive fill' },
  ...['header-from', 'header-via', 'header-to'].map((bg) => ({
    fg: 'on-header',
    bg,
    min: AA_TEXT,
    why: 'header band',
  })),
  ...['brand-from', 'brand-via', 'brand-to'].map((bg) => ({
    fg: 'on-brand',
    bg,
    min: AA_TEXT,
    why: 'login panel',
  })),
  // Alpha composites the code actually renders. axe sees these only on the
  // routes it visits; a token change breaks them everywhere at once.
  {
    fg: 'on-header',
    bg: 'header-via',
    alpha: 0.8,
    min: AA_TEXT,
    why: 'notifications.tsx renders text-on-header/80',
  },
  ...['brand-from', 'brand-to'].flatMap((bg) =>
    [0.7, 0.8].map((alpha) => ({
      fg: 'on-brand',
      bg,
      alpha,
      min: AA_TEXT,
      why: 'login/page.tsx renders text-on-brand at 70 and 80 percent',
    }))
  ),
  // Non-text: the focus ring has to be distinguishable from what it rings.
  // axe has no rule for this one, which is the argument for asserting it here.
  // The accent rings anything on the work area. It does not ring the frame —
  // `[data-rail]` and `[data-header-band]` override the colour, because the
  // accent reaches only 2.05 there. Asserting it against the frame would be
  // asserting something the stylesheet deliberately does not do.
  ...['surface', 'page'].map((bg) => ({
    fg: 'accent',
    bg,
    min: AA_LARGE,
    why: 'focus ring on the work area, SC 1.4.11',
  })),
  { fg: 'on-header', bg: 'header-via', min: AA_LARGE, why: 'focus ring on the header band' },
  // The shell frame. Its own family, so it has to be checked against its own
  // ground rather than inheriting the analytic pairs above.
  ...['rail-fg', 'rail-muted', 'rail-dim', 'rail-accent'].map((fg) => ({
    fg,
    bg: 'rail-bg',
    min: AA_TEXT,
    why: 'sidebar text on the shell frame',
  })),
  {
    fg: 'rail-accent',
    bg: 'rail-accent',
    bgAlpha: 0.1,
    bgBase: 'rail-bg',
    min: AA_TEXT,
    why: 'the active nav item: accent text on a 10% tint of itself',
  },
  { fg: 'rail-ok', bg: 'rail-bg', min: AA_LARGE, why: 'status dot, non-text' },
  // The attention amber, both jobs. The marker is a 3px bar — non-text, 3:1 —
  // and the approvals count is text, so the same token is held to both bars
  // rather than to the easier one.
  { fg: 'rail-attention', bg: 'rail-bg', min: AA_LARGE, why: 'the active-item marker, non-text' },
  { fg: 'rail-attention', bg: 'rail-bg', min: AA_TEXT, why: 'the approvals count, as text' },
  // The count is a solid pill, not a tint: a 15% tint of the amber lightens the
  // ground to 4.30 and fails, and lightening the amber to clear it would wash
  // out the one warm colour in the console. Dark text on the solid amber is the
  // same 5.63 read the other way round, and it reads louder, which is right for
  // a number that means somebody is waiting.
  { fg: 'rail-bg', bg: 'rail-attention', min: AA_TEXT, why: 'the approvals count, on the amber pill' },
  { fg: 'rail-fg', bg: 'rail-bg', min: AA_LARGE, why: 'focus ring on the rail, SC 1.4.11' },
  // The autonomy ladder. `required` now: the badge renders a named tint rather
  // than an alpha of itself, so the pair is one the palette controls.
  ...['l0', 'l1', 'l2', 'l3', 'l4'].flatMap((fg) => [
    ...['surface', 'surface-sunken'].map((bg) => ({
      fg,
      bg,
      min: AA_TEXT,
      why: 'autonomy badge text',
    })),
    { fg, bg: `${fg}-subtle`, min: AA_TEXT, why: 'autonomy badge on its own tint' },
  ]),
];

export function check(tokens = parseTokens()) {
  const results = [];

  for (const theme of ['light', 'dark']) {
    for (const pair of PAIRS) {
      const fg = tokens[theme][pair.fg];
      const bg = tokens[theme][pair.bg];
      if (!fg || !bg) {
        // A missing token is a broken assertion, not an absent one — say so
        // rather than skipping, which is how a check quietly stops checking.
        results.push({
          ...pair,
          theme,
          measured: null,
          tier: pair.tier ?? 'required',
          missing: !fg ? pair.fg : pair.bg,
        });
        continue;
      }
      // A background can itself be a composite: the active nav item renders
      // `text-rail-accent` on `bg-rail-accent/10`, so what the text sits on is
      // the tint, not the rail. Checking the plain ground passes at 4.60 while
      // the rendered pair fails at 3.91 — which is exactly what happened.
      const ground = pair.bgAlpha
        ? over(bg, tokens[theme][pair.bgBase], pair.bgAlpha)
        : bg;
      const front = pair.alpha ? over(fg, ground, pair.alpha) : fg;
      results.push({
        ...pair,
        theme,
        measured: ratio(front, ground),
        tier: pair.tier ?? 'required',
      });
    }
  }

  const failures = results.filter(
    (r) => r.tier === 'required' && (r.measured === null || r.measured < r.min)
  );
  return { results, failures };
}

export function describe(r) {
  const at = r.alpha ? `${r.fg}/${Math.round(r.alpha * 100)}` : r.fg;
  return `${r.theme.padEnd(5)} ${at} on ${r.bg}`;
}

// --- CLI ------------------------------------------------------------------

// Compare resolved filesystem paths, not URLs. `process.argv[1]` may be
// relative, and on Windows a hand-built `file://` differs from Node's
// `file:///C:/...` by a slash — either way the CLI silently does nothing, which
// is a poor failure mode for a tool whose whole job is to be run.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { results, failures } = check();
  const width = Math.max(...results.map((r) => describe(r).length));

  for (const r of results) {
    const measured = r.measured === null ? `missing --${r.missing}` : r.measured.toFixed(2);
    const ok = r.measured !== null && r.measured >= r.min;
    const verdict = ok ? 'ok' : r.tier === 'known' ? 'known' : 'FAIL';
    console.log(
      `${describe(r).padEnd(width)}  ${measured.padStart(13)}  need ${r.min.toFixed(1)}  ${verdict}`
    );
  }

  console.log(
    `\n${results.length} pairs checked across two themes; ${failures.length} required failure(s).`
  );
  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      const measured = f.measured === null ? `missing --${f.missing}` : f.measured.toFixed(2);
      console.log(`  ${describe(f)} — ${measured}, needs ${f.min.toFixed(1)} (${f.why})`);
    }
  }
  process.exit(failures.length > 0 ? 1 : 0);
}
