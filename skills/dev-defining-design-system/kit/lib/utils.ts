import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge must know the kit's scale names. Without this it reads `text-small` and `text-text`
// as two text colours and drops the first, so every badge lost its size, silently.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'h1', 'h2', 'h3', 'body', 'small', 'mono', 'tabular'] }],
      shadow: [{ shadow: ['0', '1', '2', '3'] }],
    },
  },
});

/** shadcn's class joiner: later classes win over earlier ones of the same utility. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
