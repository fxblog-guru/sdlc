// eslint.kit.js — the kit's ESLint fragment (flat config). Spread it into eslint.config.js:
//
//   import kit from './eslint.kit.js';
//   export default tseslint.config(…your config…, ...kit);
//
// It bans a second implementation of what the kit already owns: raw interactive elements and
// hand-rolled menus outside components/ui, and date/number formatting outside lib/format.
// `ui-inventory.mjs` finds the same things in a tree that has not adopted this file yet.
//
// ESLint merges `no-restricted-syntax` by REPLACING the option list, not appending. If the project
// already sets the rule (release-management bans dangerouslySetInnerHTML with it), copy those
// selectors into RESTRICT_EXTRA below, or the later config silently drops them.

export const RESTRICT_EXTRA = [];

const UI = ['src/components/ui/**', 'components/ui/**'];
const FORMAT = ['src/lib/format/**', 'src/lib/format.ts', 'lib/format/**', 'lib/format.ts'];
const TESTS = ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'];

const raw = (tag, use) => ({
  selector: `JSXOpeningElement[name.name='${tag}']`,
  message: `A raw <${tag}> outside components/ui is a second implementation of the kit's ${use} (DEV-CONTRACTS §13.3). Import it from components/ui.`,
});

export const elementRules = [
  raw('button', 'Button'),
  raw('input', 'Input / Checkbox'),
  raw('select', 'Select'),
  raw('textarea', 'Textarea'),
  raw('table', 'DataTable'),
  {
    selector: "JSXAttribute[name.name='role'][value.value=/^(menu|menuitem|menubar|listbox|tablist|dialog|alertdialog)$/]",
    message: 'A hand-rolled widget role outside components/ui. Use the kit (DropdownMenu, Tabs, Dialog), which is Radix and keyboard-complete.',
  },
  {
    selector: "VariableDeclarator[id.name=/^(BTN|BUTTON|INPUT|FIELD|BADGE|CHIP)(_[A-Z]+)*$/]",
    message: 'A local class-string constant for a kit control. Use the component and its variant prop.',
  },
];

export const formatRules = [
  {
    selector: "CallExpression[callee.property.name=/^getUTC(FullYear|Month|Date|Day|Hours|Minutes|Seconds)$/]",
    message: 'Format dates with lib/format (formatDate, formatTime, formatDateTime, formatRelative).',
  },
  {
    selector: "CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/]",
    message: 'toLocale*String hard-codes a format per call site. Use lib/format.',
  },
  {
    selector: "NewExpression[callee.object.name='Intl'][callee.property.name=/^(DateTimeFormat|NumberFormat|RelativeTimeFormat)$/]",
    message: 'A private Intl formatter. Add the format to lib/format and import it.',
  },
  {
    selector: "CallExpression[callee.property.name='slice'][arguments.length=2][arguments.0.raw='0'][arguments.1.raw=/^(10|16|19)$/]",
    message: 'Slicing an ISO string shows UTC as if it were local time. Use lib/format.',
  },
  {
    selector: "CallExpression[callee.property.name='toFixed']",
    message: 'toFixed ignores the locale. Use formatNumber / formatPercent from lib/format.',
  },
];

export default [
  {
    files: ['**/*.{ts,tsx}'],
    ignores: [...UI, ...TESTS],
    rules: { 'no-restricted-syntax': ['error', ...RESTRICT_EXTRA, ...elementRules, ...formatRules] },
  },
  {
    files: UI,
    ignores: TESTS,
    rules: { 'no-restricted-syntax': ['error', ...RESTRICT_EXTRA, ...formatRules] },
  },
  {
    files: FORMAT,
    rules: { 'no-restricted-syntax': ['error', ...RESTRICT_EXTRA, ...elementRules] },
  },
];
