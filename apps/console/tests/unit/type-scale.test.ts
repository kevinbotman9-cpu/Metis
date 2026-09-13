import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { typeOffenders } from '../type-scale';

/**
 * Type is set on the scale, and only on it. `docs/METIS_CONSOLE_SPEC.md` Part 5.
 *
 * The sweep on 2026-09-13 found 126 sites outside it; this is what stops the
 * 127th. The rules and their reasons are in `tests/type-scale.ts`.
 */

const ROOT = path.resolve(__dirname, '../..');

describe('type is set on the scale', () => {
  it('is looking at the console, not an empty directory', () => {
    // Without this, a moved app directory would make the next assertion pass by
    // scanning nothing.
    expect(fs.existsSync(path.join(ROOT, 'components/ui/primitives.tsx'))).toBe(true);
  });

  it('sets no size, line height, weight or family outside it', () => {
    const offenders = typeOffenders(ROOT).map((o) => `${o.file}:${o.line}  ${o.rule}  —  ${o.text.slice(0, 90)}`);
    expect(offenders, 'use the type tokens; the scale is in METIS_CONSOLE_SPEC.md Part 5').toEqual([]);
  });

  it('fails a text-* class that names nothing, and passes the ones that name something', () => {
    // A throwaway console root: this config, one component. The rule judges a
    // class against the config under the root it is pointed at.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'type-scale-'));
    try {
      fs.copyFileSync(path.join(ROOT, 'tailwind.config.js'), path.join(root, 'tailwind.config.js'));
      // The config is CommonJS. A `package.json` declaring `"type": "module"` above
      // the OS temp directory would otherwise make Node load it as an ES module,
      // where `module` does not exist, so the fixture declares its own module type.
      fs.writeFileSync(path.join(root, 'package.json'), '{ "type": "commonjs" }');
      fs.mkdirSync(path.join(root, 'components'));
      const fixture = (lines: string[]) => {
        fs.writeFileSync(path.join(root, 'components', 'fixture.tsx'), lines.join('\r\n'));
        return typeOffenders(root).map((o) => o.text);
      };
      expect(
        fixture([
          '<h2 className="text-h2 font-semibold">A</h2>',
          '<h2 className="font-semibold text-heading">B</h2>',
          "cn('text-contnet-muted')",
        ])
      ).toHaveLength(3);
      expect(
        fixture([
          '<p className="text-label text-content-subtle/80 hover:text-accent">A</p>',
          '<td className="text-right text-body">B</td>',
          '<span className="truncate text-ellipsis text-white">C</span>',
          '<h1 className="text-title text-rail">D</h1>',
        ])
      ).toEqual([]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps the tokens the scale names, both densities', () => {
    const css = fs.readFileSync(path.join(ROOT, 'app/globals.css'), 'utf8');
    for (const token of ['--text-label', '--text-body', '--text-title', '--text-figure']) {
      // Declared once for comfortable and once for compact, or density stops
      // reaching that size.
      expect(css.match(new RegExp(`${token}:`, 'g'))?.length ?? 0, `${token} in both density blocks`).toBe(2);
    }
  });
});
