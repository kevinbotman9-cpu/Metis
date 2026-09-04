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
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['body', 'label'] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
