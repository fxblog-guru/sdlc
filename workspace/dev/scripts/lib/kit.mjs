/**
 * kit.mjs — `design-system.mjs kit-check` (DEV-CONTRACTS §13.3): the kit the ui-spec names is built
 * and used.
 *
 * release-management's spec named shadcn and TanStack Table on every screen; components/ui held
 * five files, TanStack had zero imports and cva zero uses, and nothing failed. This reads the
 * spec's `## Components` table and the project's package.json, and says what is missing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { walkSource, toPosix } from './source.mjs';

/** The dependencies that mean "the kit is in use", and how an import of each looks. */
export const KIT_DEPS = [
  { name: 'class-variance-authority', match: (d) => d === 'class-variance-authority', use: /\bcva\s*\(/ },
  { name: '@radix-ui/*', match: (d) => d.startsWith('@radix-ui/react-') && !/^@radix-ui\/react-(primitive|compose-refs|context|id|slot|use-|presence|portal|focus-|dismissable-layer|direction|collection|roving-focus|popper|visually-hidden|arrow)/.test(d), use: null },
  { name: '@tanstack/react-table', match: (d) => d === '@tanstack/react-table', use: /\buseReactTable\s*\(/ },
];

/**
 * The components shadcn/ui (new-york) ships, plus this bundle's kit: a name from this list must
 * have its own file in components/ui. Any other PascalCase name in ## Components is bespoke and
 * must be exported somewhere in the source, wherever the spec put it.
 */
export const KIT_NAMES = new Set(('Accordion Alert AlertDialog AspectRatio Avatar Badge Breadcrumb Button Calendar Card Carousel Chart Checkbox '
  + 'Collapsible Combobox Command ContextMenu DataTable DatePicker Dialog Drawer DropdownMenu Form HoverCard Input InputOTP Label Menubar '
  + 'NavigationMenu Pagination Popover Progress RadioGroup Resizable ScrollArea Select Separator Sheet Sidebar Skeleton Slider Sonner '
  + 'Switch Table Tabs Textarea Toast Toggle ToggleGroup Tooltip '
  + 'StatusBadge Field ErrorSummary ConfirmDialog Notice EmptyState Pager Heading Toaster Link NavItem').split(/\s+/));

export const kebab =(name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();

/**
 * PascalCase names in backticks in the `## Components` table, split by column: `kit` from the
 * "From kit" column, `named` from any column. A row's notes may name a bespoke component too.
 */
export function specComponents(specText) {
  const lines = specText.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((l) => /^## Components\s*$/.test(l.trim()));
  if (start === -1) return null;
  let headers = null;
  const kit = new Map();
  const named = new Map();
  for (let i = start + 1; i < lines.length && !/^## /.test(lines[i]); i += 1) {
    const l = lines[i].trim();
    if (!l.startsWith('|')) continue;
    const cells = l.split('|').slice(1, -1).map((c) => c.trim());
    if (!headers) { headers = cells.map((c) => c.toLowerCase()); continue; }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    cells.forEach((cell, k) => {
      for (const m of cell.matchAll(/`([A-Z][A-Za-z0-9]+)`/g)) {
        const target = /kit/.test(headers[k] ?? '') ? kit : named;
        if (!target.has(m[1])) target.set(m[1], i + 1);
      }
    });
  }
  // the column says where the spec meant it to come from; the name says whether a kit has it
  for (const [k, line] of [...kit]) if (!KIT_NAMES.has(k)) { kit.delete(k); if (!named.has(k)) named.set(k, line); }
  for (const [k, line] of [...named]) if (KIT_NAMES.has(k)) { named.delete(k); if (!kit.has(k)) kit.set(k, line); }
  return { kit, named };
}

/** The project's components/ui directory: the first that exists, or the first candidate. */
export function uiDir(project, explicit) {
  if (explicit) return join(project, explicit);
  for (const c of ['src/components/ui', 'components/ui', 'app/components/ui', 'src/app/components/ui']) if (existsSync(join(project, c))) return join(project, c);
  return join(project, 'src/components/ui');
}

const SRC = (n) => /\.(tsx?|jsx?|mjs)$/.test(n) && !/\.(test|spec|stories)\.|\.d\.ts$/.test(n);

/**
 * Findings: `{ kind, name, line?, message }`. `kind` is missing-kit (a kit component with no file in
 * components/ui), missing-bespoke (a named component exported nowhere), unused-dep (a kit
 * dependency nobody imports or calls).
 */
export function kitCheck({ project, specText, ui }) {
  const out = [];
  const dir = uiDir(project, ui);
  const files = walkSource(project, SRC);
  const texts = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
  const uiFiles = files.filter((f) => toPosix(project, f).startsWith(toPosix(project, dir) + '/'));
  const exported = (name, inFiles) => inFiles.some((f) => new RegExp(`export\\s+(?:default\\s+)?(?:function|const|class|let)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b[^}]*\\}`).test(texts.get(f)));
  const spec = specText == null ? null : specComponents(specText);
  if (specText != null && !spec) out.push({ kind: 'no-components', name: '', message: 'the ui-spec has no `## Components` table' });
  if (spec) {
    for (const [name, line] of spec.kit) {
      const file = join(dir, `${kebab(name)}.tsx`);
      if (!existsSync(file) && !exported(name, uiFiles)) {
        out.push({ kind: 'missing-kit', name, line, message: `\`${name}\` is named as a kit component, and ${toPosix(project, dir)}/ has no ${kebab(name)}.tsx and no file exporting it` });
      }
    }
    for (const [name, line] of spec.named) {
      if (!exported(name, files)) out.push({ kind: 'missing-bespoke', name, line, message: `\`${name}\` is named in ## Components and no source file exports it` });
    }
  }
  const pkgPath = join(project, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies });
    const all = [...texts.values()].join('\n');
    for (const d of deps) {
      const rule = KIT_DEPS.find((k) => k.match(d));
      if (!rule) continue;
      const esc = d.replace(/[/.*+?^${}()|[\]\\]/g, '\\$&');
      const imported = new RegExp(`from\\s+['"]${esc}['"]|import\\(\\s*['"]${esc}['"]|require\\(\\s*['"]${esc}['"]`).test(all);
      const used = imported && (!rule.use || rule.use.test(all));
      if (!used) out.push({ kind: 'unused-dep', name: d, message: `${d} is a dependency and ${imported ? `is imported but never used (${rule.use})` : 'no source file imports it'} — the kit was named and not built` });
    }
  }
  return { findings: out, ui: toPosix(project, dir), uiFiles: uiFiles.length };
}
