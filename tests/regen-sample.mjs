#!/usr/bin/env node
/**
 * Regenerate tests/fixtures/state.sample.json from the valid corpus.
 *
 *   node tests/regen-sample.mjs
 *
 * The sample is what the VS Code extension is tested against. Hand-writing it meant the extension
 * was checked against a shape someone remembered rather than the one the builder emits — which is
 * how it ended up missing `knowledge`, `change_class` and `decisions` while every test stayed green.
 * Generating it removes the possibility, and the paired test in build-state.test.mjs fails the build
 * if it is ever out of date.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildState } from '../workspace/dev/scripts/build-state.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** Fixed so the file is byte-stable across runs; only the corpus should ever change it. */
export const SAMPLE_AT = new Date('2026-09-18T21:00:00Z');
export const SAMPLE_PATH = join(here, 'fixtures', 'state.sample.json');
export const SAMPLE_COMMENT =
  'GENERATED from tests/fixtures/valid by tests/regen-sample.mjs — do not hand-edit. It exists so ' +
  'the VS Code extension is tested against the shape the builder really emits; the paired test in ' +
  'build-state.test.mjs fails when the two diverge.';

export function renderSample() {
  return { _comment: SAMPLE_COMMENT, ...buildState(join(here, 'fixtures', 'valid'), SAMPLE_AT) };
}

if (process.argv[1]?.endsWith('regen-sample.mjs')) {
  writeFileSync(SAMPLE_PATH, `${JSON.stringify(renderSample(), null, 2)}\n`, 'utf8');
  console.log(`regenerated ${SAMPLE_PATH}`);
}
