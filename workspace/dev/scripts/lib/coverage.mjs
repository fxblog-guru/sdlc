/**
 * coverage.mjs — how much of the bundle a project gets, by product type and language (DEV-CONTRACTS §25).
 *
 * Every product type and every language gets the gates. What varies is how much the bundle knows on
 * top of them. Three tiers, and every pair is in one of them from day one:
 *
 *   full      a language adapter, a writing skill and a pack for the product type: every checker reads
 *             the code, every reference applies
 *   preview   the product type has a pack, but this language has not been proven on it
 *   generic   the gates run; conventions come from the repository's own knowledge cards (§16); the
 *             code checkers that need an adapter report N/A instead of passing on code they never read
 *
 * A pack is proven only when /sdlc-onboard and one `change` initiative have passed G6–G9 on a real
 * repository of that type (docs/pack-template.md). Until then the type stays out of PACKS.
 */

import { LANGS } from './langs.mjs';

/** Product types the profile may name, with what release and operate mean for each. */
export const PRODUCT_TYPES = {
  web: { release: 'container or serverless deploy', operate: 'SLOs, traces, alerts' },
  desktop: { release: 'signed installer, auto-update', operate: 'crash reports, update adoption' },
  mobile: { release: 'store build, staged rollout', operate: 'crash-free rate, store rating' },
  extension: { release: 'marketplace package (.vsix, plugin zip)', operate: 'activation errors, installs' },
  cli: { release: 'semver package or a binary per OS', operate: 'download count, issue rate' },
  library: { release: 'semver package', operate: 'download count, breaking-change reports' },
  ai: { release: 'as web, plus a versioned prompt and model id', operate: 'eval score, cost per call, refusals' },
  data: { release: 'scheduled job', operate: 'freshness, row-count drift' },
  game: { release: 'store build', operate: 'crash rate, frame time' },
  embedded: { release: 'firmware image, OTA', operate: 'fleet health' },
};

/** Product types with a proven pack, and the stack keys proven on each. */
export const PACKS = {
  web: ['go', 'python', 'react', 'nextjs', 'sql'],
};

/**
 * Product types whose pack has landed (blueprint + verify, release and operate references, §25) but
 * has not yet been proven on a real repository: every stack on them is `preview`, never `full`.
 */
export const PREVIEW_PACKS = {
  desktop: 'electron',
  extension: 'vscode-extension',
  cli: 'cli',
  library: 'cli',
  ai: 'ai-app',
  mobile: 'react-native',
};

const KNOWN = new Set(LANGS.flatMap((l) => l.stacks));

/** The tier of one stack key in one product type. */
export function tierOf(stack, type = 'web') {
  if (!KNOWN.has(stack) && stack !== 'sql') return 'generic';
  if (PACKS[type]?.includes(stack)) return 'full';
  return PACKS[type] || PREVIEW_PACKS[type] ? 'preview' : 'generic';
}

/**
 * The coverage of a project as { type, known, tiers: [{ stack, tier }], summary, notes }. An unknown
 * product type is reported, never guessed at.
 */
export function coverage(stacks, type = 'web') {
  const known = Object.hasOwn(PRODUCT_TYPES, type);
  const tiers = stacks.map((stack) => ({ stack, tier: known ? tierOf(stack, type) : 'generic' }));
  const notes = [];
  if (!known) notes.push(`product type \`${type}\` is not one of ${Object.keys(PRODUCT_TYPES).join(', ')} — every stack runs generic`);
  else if (PREVIEW_PACKS[type]) notes.push(`\`${type}\` pack is preview: blueprint \`${PREVIEW_PACKS[type]}\` and its release reference apply, but no repository of this type has passed G6–G9 on it yet`);
  else if (!PACKS[type]) notes.push(`no pack for \`${type}\` yet: release means ${PRODUCT_TYPES[type].release}, operate means ${PRODUCT_TYPES[type].operate} — say so in G9–G11 rather than following the web defaults`);
  for (const { stack, tier } of tiers) {
    if (tier === 'generic' && !KNOWN.has(stack) && stack !== 'sql') notes.push(`\`${stack}\`: no language adapter — conventions come from knowledge/conventions.md, and code checkers report N/A for it (CONTRIBUTING "Adding a language")`);
  }
  const worst = tiers.some((t) => t.tier === 'generic') ? 'generic' : tiers.some((t) => t.tier === 'preview') ? 'preview' : 'full';
  return { type, known, tiers, summary: tiers.length ? worst : 'none', notes };
}
