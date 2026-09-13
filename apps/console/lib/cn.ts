import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge has to be told about the custom scales in tailwind.config.js,
 * otherwise it mis-groups them.
 *
 * The bug this fixes: `text-body` and `text-label` are font sizes, but merge
 * defaulted to reading any unknown `text-*` as a text colour. So
 * `cn('bg-accent text-white', 'text-body')` dropped `text-white`, and every
 * primary button rendered dark text on a dark fill — a real contrast failure
 * that axe caught on the approvals page.
 *
 * It happened again on 2026-09-13, the other way round. `text-title` and
 * `text-figure` were added to the scale and not here, so
 * `cn('text-figure', 'text-block')` dropped the size and kept the colour: the
 * rail's figures and the value that never had the chance rendered at body size
 * beside correctly sized cards. `tests/unit/cn.test.ts` now reads the size
 * names from tailwind.config.js, so a size token added there and not here fails.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['body', 'label', 'title', 'figure'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
