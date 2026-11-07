/**
 * The starter page: one screen built only from a preset's tokens, so a person choosing a design
 * system can look at the choice instead of reading hex codes.
 *
 * It holds the five things nearly every product screen is made of: the preset's shell with a page
 * header and one primary action, a stat-card row, a data table with status badges, a form, and an
 * empty state. Plain HTML and CSS, no network: the preset's tokens.css is inlined, every size and
 * colour in the page CSS is a token variable, and the fonts fall back to the system stack when the
 * preset's web font is not installed. Deterministic: the same preset always gives the same bytes,
 * which is what lets a test say the committed reference shots are stale.
 *
 * The page declares what ui-rubric.mjs reads (`[data-variant="primary"]`, `[data-status]`,
 * `[data-empty]`), so every preset is held to the same hard rules as a product screen.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const SHOT_WIDTHS = [1280, 360];
export const shotName = (id, width) => `${id}-${width}.png`;
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const ICON = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a4 4 0 0 1 0 8M22 21c0-3-2-5-4-5.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  alert: '<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v7H2v-7z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};

const icon = (name, cls = 'i') => `<svg class="${cls}" data-icon viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="var(--icon-stroke, 1.75)" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** `a` mixed into `b` at `t` (0–1), as #rrggbb. Computed here, not with color-mix(), so the rubric reads plain rgb. */
const mix = (a, b, t) => `#${hex(a).map((v, i) => Math.round(v * t + hex(b)[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`;

const NAV = [['home', 'Overview'], ['box', 'Orders'], ['users', 'Customers'], ['chart', 'Reports'], ['gear', 'Settings']];
const STATUS = { success: ['check', 'Delivered'], warning: ['alert', 'Delayed'], danger: ['x', 'Failed'], info: ['info', 'In transit'] };
const ROWS = [
  ['ORD-1042', 'Northwind Traders', 'success', 3, '$1,240.00', '2 min ago'],
  ['ORD-1041', 'Contoso Pharmacy', 'info', 12, '$8,915.50', '18 min ago'],
  ['ORD-1040', 'Fabrikam Outdoor', 'warning', 1, '$64.90', '1 h ago'],
  ['ORD-1039', 'Adventure Works', 'danger', 7, '$2,307.00', '3 h ago'],
  ['ORD-1038', 'Tailspin Toys', 'success', 24, '$12,480.75', 'Yesterday'],
];
const STATS = [['Open orders', '128', 'up', '12% vs last week'], ['Revenue today', '$24,861', 'up', '4% vs yesterday'], ['Late shipments', '6', 'down', '2 fewer than Monday'], ['Return rate', '1.8%', 'down', '0.3 pts this month']];

/** The token space step nearest `px`, as a variable, so each preset spaces with its own scale. */
function spacer(p) {
  return (px) => {
    let best = 0;
    p.space.forEach((v, i) => { if (Math.abs(v - px) < Math.abs(p.space[best] - px)) best = i; });
    return `var(--space-${best})`;
  };
}

function pageCss(p) {
  const s = spacer(p);
  const c = p.color.light;
  const rail = p.shell === 'bottom-tabs';
  // a top nav of five links does not fit a 768px tablet beside the account controls: it shows from bp.lg
  const sideFrom = rail || p.shell === 'topnav' ? 1024 : 768;
  return `
:root {
  --nav-active: ${mix(c.primary, c.surface, 0.1)};
}
* { box-sizing: border-box; }
html { background: var(--color-bg); }${rail ? `
/* the bottom tab bar is sticky: a focused control scrolls clear of it (WCAG 2.4.11) */
html { scroll-padding-bottom: calc(var(--control-height-lg) + ${s(16)}); }` : ''}
body { margin: 0; background: var(--color-bg); color: var(--color-text); font-family: var(--font-sans);
  font-size: var(--type-body-size); line-height: var(--type-body-line); }
h1, h2, h3, p { margin: 0; }
h1 { font-family: var(--font-display, var(--font-sans)); font-size: var(--type-h1-size); line-height: var(--type-h1-line); font-weight: var(--type-h1-weight); letter-spacing: var(--type-h1-tracking); }
h2 { font-size: var(--type-h3-size); line-height: var(--type-h3-line); font-weight: var(--type-h3-weight); }
h3 { font-size: var(--type-body-size); line-height: var(--type-body-line); font-weight: var(--weight-semibold); }
a { color: var(--color-primary); }
.small { font-size: var(--type-small-size); line-height: var(--type-small-line); }
.muted { color: var(--color-text-muted); }
.i { width: var(--icon-md); height: var(--icon-md); flex: none; }
.skip { position: absolute; left: -9999px; }
.skip:focus { left: ${s(8)}; top: ${s(8)}; }
:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }

.app { display: flex; min-height: 100vh; }
.side { display: none; flex-direction: column; gap: ${s(4)}; width: var(--control-sidebar-width); flex: none;
  padding: ${s(16)} ${s(12)}; background: var(--color-surface); border-right: 1px solid var(--color-border); }
.brand { display: flex; align-items: center; gap: ${s(8)}; font-weight: var(--weight-semibold); color: var(--color-text); text-decoration: none; padding: 0 ${s(8)}; min-height: var(--control-height-md); }
.mark { width: 24px; height: 24px; flex: none; }
.side .brand { margin-bottom: ${s(16)}; }
.nav { display: flex; align-items: center; gap: ${s(12)}; min-height: var(--control-height-md); padding: 0 ${s(8)};
  border-radius: var(--radius-md); color: var(--color-text-muted); text-decoration: none; }
/* the label is text on the wash (primary on a primary wash was 3.95:1 on carbon-enterprise); the icon and weight mark it */
.nav[aria-current="page"] { background: var(--nav-active); color: var(--color-text); font-weight: var(--weight-semibold); }
.nav[aria-current="page"] .i { color: var(--color-primary); }
.side nav { flex: 1; }
.side .account { display: flex; align-items: center; gap: ${s(8)}; padding: ${s(8)}; border-top: 1px solid var(--color-border); }
.avatar { width: 32px; height: 32px; border-radius: var(--radius-full); background: var(--color-surface-2); color: var(--color-text);
  display: inline-flex; align-items: center; justify-content: center; font: inherit; font-size: var(--type-small-size); font-weight: var(--weight-semibold); flex: none; border: 0; padding: 0; }\n.appbar .avatar { width: var(--density-control-height); height: var(--density-control-height); }
.col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.appbar { display: flex; align-items: center; gap: ${s(12)}; min-height: calc(var(--control-height-md) + 2 * ${s(12)}); padding: ${s(8)} ${s(16)};
  background: var(--color-surface); border-bottom: 1px solid var(--color-border); }
.appbar .grow { flex: 1; }
.topnav { display: none; gap: ${s(4)}; }
.search { display: none; align-items: center; gap: ${s(8)}; min-width: 0; width: 320px; height: var(--control-height-md); padding: 0 ${s(12)};
  border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface-2); color: var(--color-text-muted); }

.content { width: 100%; max-width: var(--control-content-max); margin: 0 auto; padding: ${s(24)} ${s(16)} ${s(48)}; display: grid; gap: ${s(24)}; min-width: 0; }
.content > * { min-width: 0; }
.page-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: ${s(16)}; }
.actions { display: flex; gap: ${s(8)}; }
.btn { display: inline-flex; align-items: center; justify-content: center; gap: ${s(8)}; min-height: var(--density-control-height); min-width: var(--control-target-min);
  padding: 0 ${s(16)}; border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); background: var(--color-surface);
  color: var(--color-text); font: inherit; font-weight: var(--weight-medium); text-decoration: none; cursor: pointer; }
.btn.primary { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-primary-fg); box-shadow: var(--shadow-1); }
.btn.ghost { border-color: transparent; background: transparent; }
.btn.icon { padding: 0; width: var(--density-control-height); }
.btn.wide-only { display: none; }

.content { container-type: inline-size; }
.stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: ${s(16)}; }
.card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-lg); box-shadow: var(--shadow-1); min-width: 0; }
.stat { padding: ${s(16)} ${s(20)}; display: grid; gap: ${s(4)}; }
.stat .value { font-size: var(--type-h1-size); line-height: var(--type-h1-line); font-weight: var(--weight-semibold); font-variant-numeric: tabular-nums; letter-spacing: var(--type-h1-tracking); }
.delta { display: flex; align-items: center; gap: ${s(4)}; }
.delta .up { color: var(--color-success); } .delta .down { color: var(--color-info); }

.card-head { display: flex; align-items: center; justify-content: space-between; gap: ${s(12)}; padding: ${s(16)} ${s(20)}; }
.table-card { container-type: inline-size; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: var(--density-cell-pad-y) var(--density-cell-pad-x); border-top: 1px solid var(--color-border); white-space: nowrap; height: var(--density-row-height); }
th { font-size: var(--type-small-size); line-height: var(--type-small-line); font-weight: var(--weight-medium); color: var(--color-text-muted); background: var(--color-surface-2); }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.mono { font-family: var(--font-mono); font-size: var(--type-mono-size); }
.badge { display: inline-flex; align-items: center; gap: ${s(4)}; padding: 0 ${s(8)}; border-radius: var(--radius-full);
  font-size: var(--type-small-size); line-height: 1.6; font-weight: var(--weight-medium); border: 1px solid currentColor; background: transparent; }
.badge > span { color: var(--color-text); }
.badge .i { width: var(--icon-sm); height: var(--icon-sm); }
${Object.keys(STATUS).map((k) => `.badge[data-status="${k}"] { color: var(--color-${k}); }`).join('\n')}

.split { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: ${s(16)}; align-items: start; }
form { padding: 0 ${s(20)} ${s(20)}; display: grid; gap: ${s(16)}; }
.field { display: grid; gap: ${s(4)}; }
label { font-weight: var(--weight-medium); }
input, select { font: inherit; color: var(--color-text); background: var(--color-surface); height: var(--density-control-height); padding: 0 ${s(12)};
  border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); width: 100%; min-width: 0; }
input[aria-invalid="true"] { border-color: var(--color-danger); box-shadow: inset 0 0 0 1px var(--color-danger); }
.error { color: var(--color-danger); display: flex; align-items: flex-start; gap: ${s(4)}; }
.error .i { width: var(--icon-sm); height: var(--icon-sm); height: calc(var(--type-small-size) * var(--type-small-line)); }
.form-actions { display: flex; gap: ${s(8)}; justify-content: flex-end; }

[data-empty] { display: grid; justify-items: center; text-align: center; gap: ${s(8)}; padding: ${s(32)} ${s(24)}; }
.empty-icon { width: 48px; height: 48px; border-radius: var(--radius-full); background: var(--color-surface-2); color: var(--color-text-muted);
  display: inline-flex; align-items: center; justify-content: center; margin-bottom: ${s(4)}; }
.empty-icon .i { width: var(--icon-lg); height: var(--icon-lg); }
[data-empty] p { max-width: 36ch; }
[data-empty] .btn { margin-top: ${s(8)}; }

.tabs { position: sticky; bottom: 0; display: ${rail ? 'grid' : 'none'}; grid-template-columns: repeat(${NAV.length}, 1fr); background: var(--color-surface); border-top: 1px solid var(--color-border); }
.tab { display: grid; justify-items: center; gap: 2px; padding: ${s(8)} 0; min-height: var(--control-height-lg); color: var(--color-text-muted); text-decoration: none; font-size: var(--type-small-size); line-height: var(--type-small-line); }
.tab[aria-current="page"] { color: var(--color-text); font-weight: var(--weight-semibold); }
.tab[aria-current="page"] .i { color: var(--color-primary); }

@container (min-width: 800px) { .stats { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@container (max-width: 820px) { .hide-md { display: none; } }
@container (max-width: 640px) { .hide-sm { display: none; } }
@container (max-width: 400px) { th, td { padding-left: ${s(8)}; padding-right: ${s(8)}; } th:first-child, td:first-child { padding-left: var(--density-cell-pad-x); } th:last-child, td:last-child { padding-right: var(--density-cell-pad-x); } }
@media (max-width: 767px) {
  .export { display: none; }
  .page-head .actions { width: 100%; }
  .page-head .actions .primary { flex: 1; }
}
@media (min-width: ${sideFrom}px) {
  .side { display: flex; }
  .menu-btn { display: none; }
  ${p.shell === 'sidebar' ? '.appbar { display: none; }' : ''}
  ${p.shell !== 'topnav' ? '.appbar .brand { display: none; }' : ''}
  ${rail ? '.tabs { display: none; }' : ''}
  .content { padding: ${s(32)} ${s(32)} ${s(48)}; }
}
@media (min-width: 768px) {
  .btn.wide-only { display: inline-flex; }
  .search { display: flex; }
}
@media (min-width: ${sideFrom}px) { .topnav { display: flex; } }
`;
}

function shell(p, main) {
  const brand = '<a class="brand" href="#"><svg class="mark" data-brand viewBox="0 0 24 24" role="img" aria-label="Acme"><rect width="24" height="24" rx="6" fill="var(--color-primary)"/><path d="M7 16.5 12 7l5 9.5" fill="none" stroke="var(--color-primary-fg)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Acme Ops</span></a>';
  const navLinks = NAV.map(([ic, label], i) => `<a class="nav" href="#"${i === 1 ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('');
  const side = p.shell === 'topnav' ? '' : `<aside class="side"><nav aria-label="Main">${brand}${navLinks}</nav><div class="account"><span class="avatar" aria-hidden="true">JL</span><span class="small">Jamie Lee<br><span class="muted">Admin</span></span></div></aside>`;
  const menu = p.shell === 'bottom-tabs' ? '' : `<button class="btn ghost icon menu-btn" type="button" aria-label="Open menu">${icon('menu')}</button>`;
  const top = p.shell === 'topnav' ? `<nav class="topnav" aria-label="Main">${navLinks}</nav>` : '';
  const search = p.shell === 'topbar-sidebar' ? '<span class="search">' + icon('search') + '<span>Search orders, customers…</span></span>' : '';
  const bell = p.shell === 'sidebar' ? '' : `<button class="btn ghost icon wide-only" type="button" aria-label="Notifications">${icon('bell')}</button>`;
  const appbar = `<header class="appbar">${menu}${brand}${top}${search}<span class="grow"></span>${bell}<button class="avatar" type="button" aria-label="Account">JL</button></header>`;
  const tabs = p.shell === 'bottom-tabs' ? `<nav class="tabs" aria-label="Tabs">${NAV.map(([ic, label], i) => `<a class="tab" href="#"${i === 1 ? ' aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('')}</nav>` : '';
  return `<a class="skip" href="#main">Skip to content</a>
<div class="app">${side}<div class="col">${appbar}
<main id="main" class="content">
${main}
</main>${tabs}</div></div>`;
}

function mainHtml() {
  const stats = STATS.map(([label, value, dir, note]) => `<div class="card stat"><span class="muted">${label}</span><span class="value">${value}</span><span class="delta small muted"><span class="${dir}">${icon(dir === 'up' ? 'up' : 'down')}</span>${note}</span></div>`).join('\n');
  const rows = ROWS.map(([id, who, st, items, total, when]) => `<tr><td><a class="mono" href="#">${id}</a></td><td class="hide-sm">${who}</td><td><span class="badge" data-status="${st}">${icon(STATUS[st][0])}<span>${STATUS[st][1]}</span></span></td><td class="num hide-sm">${items}</td><td class="num">${total}</td><td class="hide-md muted">${when}</td></tr>`).join('\n');
  return `<div class="page-head"><div><p class="small muted">Workspace / Orders</p><h1>Orders</h1></div>
<div class="actions"><button class="btn export" type="button">Export</button><button class="btn primary" data-variant="primary" type="button">${icon('plus')}New order</button></div></div>
<section class="stats" aria-label="Summary">
${stats}
</section>
<section class="card table-card" aria-labelledby="recent"><div class="card-head"><h2 id="recent">Recent orders</h2><a class="small" href="#">View all</a></div>
<div class="scroll"><table>
<thead><tr><th scope="col">Order</th><th scope="col" class="hide-sm">Customer</th><th scope="col">Status</th><th scope="col" class="num hide-sm">Items</th><th scope="col" class="num">Total</th><th scope="col" class="hide-md">Updated</th></tr></thead>
<tbody>
${rows}
</tbody></table></div></section>
<div class="split">
<section class="card" aria-labelledby="invite"><div class="card-head"><h2 id="invite">Invite a teammate</h2></div>
<form onsubmit="return false" novalidate>
<div class="field"><label for="f-name">Full name</label><input id="f-name" autocomplete="name" value="Dana Whitfield"></div>
<div class="field"><label for="f-email">Work email</label><input id="f-email" type="email" autocomplete="email" value="dana@northwind" aria-invalid="true" aria-describedby="f-email-err"><span id="f-email-err" class="error small">${icon('x')}Enter a full address, like name@company.com</span></div>
<div class="field"><label for="f-role">Role</label><select id="f-role"><option>Viewer</option><option selected>Editor</option><option>Admin</option></select><span class="small muted">Editors can create and change orders.</span></div>
<div class="form-actions"><button class="btn ghost" type="button">Cancel</button><button class="btn" type="button">Send invite</button></div>
</form></section>
<section class="card" aria-labelledby="returns"><div class="card-head"><h2 id="returns">Returns</h2></div>
<div data-empty><span class="empty-icon">${icon('inbox')}</span><h3>No returns yet</h3><p class="muted">When a customer sends something back, it shows up here with its reason and refund.</p><a class="btn" href="#">Set up a return policy</a></div>
</section>
</div>`;
}

/**
 * The starter page for preset `p`. `css` is the preset's rendered tokens.css (renderCss), passed in
 * so this module does not import the script that imports it.
 */
export function starterHtml(p, css) {
  return `<!doctype html>
<!-- Generated by dev/scripts/design-system.mjs preview from preset \`${p.id}\`. Do not edit: change the preset and re-run. -->
<html lang="en" data-theme="light" data-density="${p.density in (p.density_modes ?? {}) ? p.density : 'comfortable'}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.name} starter</title>
<style>
${css}${pageCss(p)}</style></head>
<body data-shell="${p.shell}">
${shell(p, mainHtml())}
</body></html>
`;
}

/** The gallery a person opens to choose: every preset's two shots, its summary, and a link to the live page. */
export function galleryHtml(presets) {
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const cards = presets.map((p) => `<section id="${p.id}">
<h2>${esc(p.name)} <code>${p.id}</code></h2>
<p>${esc(p.summary)}</p>
<p class="meta">shell ${p.shell} · density ${p.density} · <a href="${p.id}.html">open the live page</a></p>
<div class="pair"><a href="${shotName(p.id, 1280)}"><img src="${shotName(p.id, 1280)}" alt="${esc(p.name)} at 1280px" loading="lazy"></a><a href="${shotName(p.id, 360)}"><img class="phone" src="${shotName(p.id, 360)}" alt="${esc(p.name)} at 360px" loading="lazy"></a></div>
</section>`).join('\n');
  return `<!doctype html>
<!-- Generated by dev/scripts/design-system.mjs preview. Do not edit. -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Design system presets</title>
<style>
body { margin: 0; padding: 24px; font: 15px/1.5 system-ui, sans-serif; background: #f4f4f5; color: #18181b; }
h1 { margin: 0 0 4px; font-size: 24px; } h2 { margin: 0 0 4px; font-size: 18px; } p { margin: 0 0 8px; } code { font-size: 13px; color: #52525b; }
.meta { color: #52525b; font-size: 13px; }
section { background: #fff; border: 1px solid #e4e4e7; border-radius: 12px; padding: 16px; margin-top: 24px; }
.pair { display: flex; gap: 16px; align-items: flex-start; overflow-x: auto; }
.pair img { display: block; border: 1px solid #e4e4e7; border-radius: 8px; max-width: 100%; height: auto; }
.pair a:first-child { flex: 1 1 auto; min-width: 0; } .pair img.phone { width: 180px; }
</style></head><body>
<h1>Design system presets</h1>
<p>Each preset drawn on the same screen, at 1280px and 360px, light theme. Pick by looking; then run <code>/sdlc-design-system &lt;id&gt;</code>.</p>
${cards}
</body></html>
`;
}

/**
 * What is wrong with the shots in `dir` for `presets`: a missing or empty PNG, a starter page that
 * is missing or no longer what the generator makes (the preset changed and nobody re-shot it).
 *
 * @param {(p: object) => string} make the generator, `(p) => starterHtml(p, renderCss(p))`
 * @returns {string[]} one line per problem; empty when every preset has current shots
 */
export function shotProblems(dir, presets, make) {
  const out = [];
  const manifestPath = join(dir, 'manifest.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : null;
  if (!manifest) out.push(`${manifestPath} is missing`);
  for (const p of presets) {
    for (const w of SHOT_WIDTHS) {
      const f = join(dir, shotName(p.id, w));
      if (!existsSync(f) || statSync(f).size === 0) out.push(`${p.id}: no shot at ${w}px (${shotName(p.id, w)})`);
    }
    const html = join(dir, `${p.id}.html`);
    if (!existsSync(html)) out.push(`${p.id}: no starter page (${p.id}.html)`);
    else if (readFileSync(html, 'utf8').replace(/\r\n/g, '\n') !== make(p)) out.push(`${p.id}: the starter page is stale — the preset changed; re-run design-system.mjs preview`);
    const entry = manifest?.presets?.[p.id];
    if (manifest && !entry) out.push(`${p.id}: not in manifest.json`);
    else if (entry && entry.html_sha256 !== sha256(make(p))) out.push(`${p.id}: the shots were taken of an older starter page; re-run design-system.mjs preview`);
  }
  return out;
}
