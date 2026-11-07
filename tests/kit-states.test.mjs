/**
 * The reference kit defines every interaction state once (DEV-CONTRACTS §13.13): hover, focus,
 * pressed, selected, disabled and loading, per interactive primitive, so no screen invents its own.
 * The kit's own vitest file (interaction-states.test.tsx) checks the rendered attributes in a
 * project; this reads the class strings in the bundle, so the suite fails when a state is dropped.
 *
 *   node --test tests/kit-states.test.mjs
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const here = dirname(fileURLToPath(import.meta.url));
const UI = join(here, '..', 'skills', 'dev-defining-design-system', 'kit', 'components', 'ui');
const read = (f) => readFileSync(join(UI, f), 'utf8');

/** State → the class prefixes or attributes that express it (any one is enough). */
const STATES = {
  hover: [/\bhover:/, /data-\[highlighted\]:/],
  focus: [/focus-visible:(ring|outline)/, /outline-none/],
  pressed: [/\bactive:/],
  selected: [/aria-pressed:/, /data-\[state=(active|checked)\]:/, /aria-current/, /data-\[selected\]:/, /aria-selected/],
  disabled: [/\bdisabled:/, /data-\[disabled\]:/],
  loading: [/aria-busy/],
};

/** Each interactive primitive and the states it must define. */
const REQUIRED = {
  'button.tsx': ['hover', 'focus', 'pressed', 'selected', 'disabled', 'loading'],
  'dropdown-menu.tsx': ['hover', 'focus', 'pressed', 'selected', 'disabled'],
  'tabs.tsx': ['hover', 'focus', 'pressed', 'selected', 'disabled'],
  'link.tsx': ['hover', 'focus', 'selected'],
  'input.tsx': ['focus', 'disabled'],
  'checkbox.tsx': ['focus'],
  'data-table.tsx': ['hover', 'focus', 'selected'],
};

export function missingStates(text, states) {
  return states.filter((s) => !STATES[s].some((re) => re.test(text)));
}

test('every interactive kit primitive defines its interaction states', () => {
  for (const [file, states] of Object.entries(REQUIRED)) {
    assert.deepEqual(missingStates(read(file), states), [], `${file} lacks a state class`);
  }
});

test('the check fails a primitive whose pressed or loading state is removed', () => {
  const button = read('button.tsx');
  assert.deepEqual(missingStates(button.replace(/active:\S+/g, ''), REQUIRED['button.tsx']), ['pressed']);
  assert.deepEqual(missingStates(button.replace(/aria-busy\S*/g, ''), REQUIRED['button.tsx']), ['loading']);
});

test('the kit ships its own vitest for the rendered states', () => {
  assert.match(read('interaction-states.test.tsx'), /aria-pressed/);
});
