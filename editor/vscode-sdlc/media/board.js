// @ts-check
/**
 * The page behind both webviews: the sidebar Overview (`data-layout="sidebar"`, narrow, tabbed)
 * and the Board tab (`data-layout="page"`, wide, everything on one scroll).
 *
 * It receives a view model from the extension (see `viewmodel.ts`, `live.ts`) and draws it. It owns
 * nothing but the reader's place — initiative, tab, task, filter, search, which requirements are
 * open — and keeps that across refreshes with the webview state API, so a live update under an open
 * task does not close it. The only clock it keeps is the one that re-words "2 min ago".
 *
 * Every state is shown as an icon, a colour and a word together; colour alone never carries one.
 */
(function () {
  const vscode = acquireVsCodeApi();
  const app = /** @type {HTMLElement} */ (document.getElementById('app'));
  const layout = document.body.dataset.layout === 'sidebar' ? 'sidebar' : 'page';
  const T = /** @type {any} */ (window).SdlcTime;

  /** @type {{slug?: string, tab: string, task?: string, filter: string, q: string, stack: string, openReqs: string[], reqFilter: string, sev: string}} */
  const ui = Object.assign({ tab: 'now', view: 'board', filter: 'all', q: '', stack: '', openReqs: [], reqFilter: 'all', sev: 'all' }, vscode.getState() || {});
  /** @type {any} */
  let vm = null;
  let addonVersion = '';
  /** A known update of the dev bundle (from the file `afx` writes), or null. */
  let update = /** @type {any} */ (null);
  /** Whether the host feeds the Agents tab (agents.js), and how many agents are working now. */
  let agentsOn = false;
  let agentsRunning = /** @type {number | null} */ (null);
  const AV = /** @type {any} */ (window).AgentsView;
  if (AV)
    AV.init(vscode, (n) => {
      agentsRunning = n;
      for (const el of document.querySelectorAll('[data-ag-count]')) {
        el.textContent = n ? String(n) : '';
        el.classList.toggle('on', !!n);
      }
    });
  const agentsTab = () => agentsOn && !!AV;
  const agentsCount = () => `<span class="n ag-count ${agentsRunning ? 'on' : ''}" data-ag-count>${agentsRunning || ''}</span>`;
  /** Hand the Agents tab its element after a redraw, or tell it it is hidden. */
  const mountAgents = () => AV && AV.mount(document.getElementById('ag-mount'));
  /** Activity keys already drawn, so a new event can be marked as it arrives. */
  let seen = /** @type {Set<string> | null} */ (null);

  const save = () => vscode.setState(ui);

  const esc = (v) =>
    String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const ago = (at) => (T ? T.relativeTime(at) : '');
  /** A relative time that keeps ticking: the interval below re-words every `[data-at]`. */
  const when = (at, cls = '') => `<time class="when ${cls}" data-at="${esc(at)}" datetime="${esc(typeof at === 'number' ? new Date(at).toISOString() : at)}" title="${esc(typeof at === 'number' ? new Date(at).toLocaleString() : at)}">${esc(ago(at))}</time>`;

  const STAGE = { G0: 'Intake', G1: 'Requirements', G2: 'Design', G3: 'Data', G4: 'API', G5: 'UI', G6: 'Plan', G7: 'Implementation', G8: 'Verification', G9: 'Release', G10: 'Deployment', G11: 'Monitoring' };
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
  const stageName = (g) => (g.stage ? (g.stage === 'api' ? 'API' : g.stage === 'ui' ? 'UI' : cap(g.stage)) : STAGE[g.gate] ?? '');

  /** Gate state → [icon, class, word]. */
  const GATE = {
    PASS: ['✓', 'st-pass', 'passed'],
    STALE: ['↻', 'st-stale', 'stale'],
    CHANGES_REQUESTED: ['!', 'st-changes', 'changes requested'],
    BLOCKED: ['✕', 'st-blocked', 'blocked'],
    REVIEWING: ['◉', 'st-review', 'reviewing'],
    AUTHORING: ['✎', 'st-author', 'authoring'],
    READY: ['▷', 'st-ready', 'ready'],
    SKIPPED: ['–', 'st-skipped', 'skipped'],
    NOT_STARTED: ['○', 'st-idle', 'not started'],
  };
  /** What a gate shows: the builder's state, or the live overlay when the files are ahead of it. */
  const shown = (g) => (g.live ? g.live.state : g.state);
  const gateLook = (g) => GATE[shown(g)] ?? GATE.NOT_STARTED;

  const ACTION = { blocked: ['✕', 'bad'], changes: ['!', 'warn'], decision: ['?', 'bad'], stale: ['↻', 'warn'], continue: ['▶', 'accent'], start: ['▷', 'accent'], findings: ['◇', 'muted'], done: ['✓', 'ok'] };
  const SEV = { blocker: ['⛔', 'sev-blocker', 'blocker'], major: ['▲', 'sev-major', 'major'], minor: ['●', 'sev-minor', 'minor'], info: ['i', 'sev-info', 'info'], unknown: ['?', 'sev-info', 'unrated'] };
  const ACT = { commit: ['●', 'k-commit'], 'gate-log': ['✓', 'k-gate'], verification: ['▶', 'k-verify'], lane: ['≡', 'k-lane'], task: ['✓', 'k-task'], progress: ['✓', 'k-task'], decision: ['?', 'k-decision'], state: ['↻', 'k-state'], run: ['▶', 'k-verify'], stop: ['■', 'k-decision'], gate: ['✓', 'k-gate'] };

  const TASK_GLYPH = { done: '✓', 'in-progress': '◐', blocked: '⊘', todo: '○' };
  const TASK_LABEL = { done: 'Done', 'in-progress': 'In progress', blocked: 'Blocked', todo: 'Todo' };
  const TASK_ORDER = ['todo', 'in-progress', 'blocked', 'done'];

  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const LIVE_WINDOW_MS = 10 * 60 * 1000;

  function statusDot(status, short) {
    return `<span class="status-dot s-c-${esc(status)}"><span class="glyph" aria-hidden="true">${TASK_GLYPH[status] ?? '○'}</span>${short ? `<span class="sr">${TASK_LABEL[status] ?? esc(status)}</span>` : TASK_LABEL[status] ?? esc(status)}</span>`;
  }

  function bar(counts, cls = '') {
    const total = counts.total || 1;
    const seg = (k) => (counts[k] ? `<span class="s-${k}" style="width:${(counts[k] / total) * 100}%" title="${TASK_LABEL[k]} ${counts[k]}"></span>` : '');
    return `<div class="bar ${cls}" role="img" aria-label="${counts.done} of ${counts.total} done">${seg('done')}${seg('in-progress')}${seg('blocked')}</div>`;
  }

  /** A progress ring: one number, read at a glance. */
  function ring(n, d, size) {
    const p = pct(n, d);
    const r = 20;
    const c = 2 * Math.PI * r;
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 48 48" role="img" aria-label="${p}% of tasks done">
      <circle class="track" cx="24" cy="24" r="${r}" />
      <circle class="fill" cx="24" cy="24" r="${r}" stroke-dasharray="${((c * p) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 24 24)" />
      <text x="24" y="24" dy="0.36em" text-anchor="middle">${p}<tspan class="pct">%</tspan></text>
    </svg>`;
  }

  function cmd(text) {
    return `<span class="cmd"><code>${esc(text)}</code><button class="copy" data-copy="${esc(text)}" title="Copy command" aria-label="Copy ${esc(text)}">⧉</button></span>`;
  }

  function section(title, count, body, extra = '') {
    return `<section class="sec"><header class="sec-head"><h2>${title}</h2>${count != null ? `<span class="count">${count}</span>` : ''}<span class="spacer"></span>${extra}</header>${body}</section>`;
  }

  // ---- header and live state ---------------------------------------------------------------------

  function isLive() {
    const last = vm.live && vm.live.last;
    return !!(vm.live && vm.live.watching && last && Date.now() - last.at < LIVE_WINDOW_MS);
  }

  function livePill() {
    if (!vm.live || !vm.live.watching) return '';
    const on = isLive();
    return `<span class="live ${on ? 'on' : 'idle'}" title="${on ? 'Files are changing — the board redraws as they are written.' : 'Watching for changes. Nothing has moved in the last 10 minutes.'}"><span class="pulse" aria-hidden="true"></span>${on ? 'Live' : 'Watching'}</span>`;
  }

  function lastEvent() {
    const last = vm.live && vm.live.last;
    if (!last) return '';
    return `<div class="last-event" title="${esc(last.detail ?? '')}"><span class="label">Last event</span><span class="what">${esc(last.title)}</span>${when(last.at)}</div>`;
  }

  function header() {
    const banner = vm.staleFiles.length
      ? `<div class="banner warn" role="status"><span class="b-icon" aria-hidden="true">↻</span><div>The index may be out of date — ${vm.staleFiles.length} file${vm.staleFiles.length === 1 ? '' : 's'} changed after it was built. ${
          vm.live && vm.live.ahead ? 'Task, decision and gate changes below are read from the files directly.' : ''
        } Run <code>npm run dev:state</code> to rebuild it.${layout === 'page' ? `<span class="files">${esc(vm.staleFiles.slice(0, 3).join(' · '))}${vm.staleFiles.length > 3 ? ' …' : ''}</span>` : ''}</div></div>`
      : vm.live && vm.live.ahead
        ? `<div class="banner info" role="status"><span class="b-icon" aria-hidden="true">◉</span><div>Showing changes newer than the index. Anything marked <span class="tag live-tag">live</span> comes straight from the files; the next rebuild confirms it.</div></div>`
        : '';
    const branch = vm.live && vm.live.branch ? `<span class="branch" title="branch${vm.live.head ? ` @ ${esc(vm.live.head)}` : ''}"><span aria-hidden="true">⎇</span>${esc(vm.live.branch)}${vm.live.head && layout === 'page' ? ` <span class="sha">${esc(vm.live.head)}</span>` : ''}</span>` : '';
    return `<header class="topbar">
        <div class="brand">
          <span class="logo" aria-hidden="true">◆</span>
          <div class="brand-text"><div class="project">${esc(vm.project)}</div>
          <div class="meta">${branch}<span class="built" title="generated ${esc(vm.generatedAt)} · builder ${esc(vm.generatorVersion)}">index ${when(vm.generatedAt)}</span>${layout === 'page' ? '' : versionPill()}</div></div>
        </div>
        <div class="top-right">${layout === 'page' ? versionPill() : ''}${livePill()}</div>
      </header>
      ${lastEvent()}
      ${banner}`;
  }

  function versionPill() {
    const parts = [];
    if (addonVersion) parts.push(`board v${esc(addonVersion)}`);
    if (vm.generatorVersion) parts.push(`sdlc v${esc(vm.generatorVersion)}`);
    if (!parts.length) return '';
    if (update) {
      // Amber, an icon and a word, never colour alone; a real button so keyboard and readers reach it.
      return `<button type="button" class="version-pill update${update.kind === 'major' ? ' major' : ''}" data-update aria-label="${esc(update.aria)}" title="${esc(update.aria)}"><span class="u-icon" aria-hidden="true">↑</span>${parts.join(' · ')} · <strong>${esc(update.short)}</strong></button>`;
    }
    return `<span class="version-pill" title="VS Code board ${esc(addonVersion || '?')} · sdlc bundle (state builder) ${esc(vm.generatorVersion || '?')}">${parts.join(' · ')}</span>`;
  }

  function knowledge() {
    if (!vm.knowledge) return '';
    const [g, c] = GATE[vm.knowledge.state] ?? GATE.NOT_STARTED;
    return `<div class="knowledge"><span class="chip-state ${c}"><span aria-hidden="true">${g}</span>GK · ${esc(vm.knowledge.label)}</span><span class="muted">Repository knowledge — ${esc(vm.knowledge.detail)}</span></div>`;
  }

  function initiativeSwitch() {
    if (vm.initiatives.length < 2) return '';
    if (layout === 'sidebar') {
      return `<select id="slug" class="select" aria-label="Initiative">${vm.initiatives
        .map((i) => `<option value="${esc(i.slug)}" ${i.slug === ui.slug ? 'selected' : ''}>${esc(i.slug)} — ${esc(i.currentGate)} · ${i.counts.done}/${i.counts.total}</option>`)
        .join('')}</select>`;
    }
    return `<div class="tabs" role="tablist">${vm.initiatives
      .map(
        (i) => `<button class="tab ${i.slug === ui.slug ? 'selected' : ''}" data-slug="${esc(i.slug)}" role="tab" aria-selected="${i.slug === ui.slug}">
          <strong>${esc(i.slug)}</strong><span class="muted small">${esc(i.currentGate)} · ${esc(i.phase)}</span>${bar(i.counts, 'tiny')}
        </button>`,
      )
      .join('')}</div>`;
  }

  // ---- hero, pipeline, KPIs ----------------------------------------------------------------------

  function currentGate(i) {
    return i.gates.find((g) => g.gate === i.currentGate) ?? i.gates[0];
  }

  function stateChip(g, withLive = true) {
    const [icon, cls, word] = gateLook(g);
    const tag = withLive && g.live ? `<span class="tag live-tag" title="${esc(g.live.note)}">${g.live.source === 'log' ? 'from log' : 'live'}</span>` : '';
    return `<span class="chip-state ${cls}"><span aria-hidden="true">${icon}</span>${esc(word)}</span>${tag}`;
  }

  function hero(i) {
    const c = i.counts;
    const g = currentGate(i);
    const side = layout === 'sidebar';
    return `<section class="hero">
      <div class="hero-main">
        <div class="hero-text">
          <div class="eyebrow">${esc(i.phase)} phase${i.changeClass ? ` · ${esc(i.changeClass)}` : ''}${i.tracker && i.tracker !== 'none' ? ` · ${esc(i.tracker)}` : ''}</div>
          <h1>${esc(i.slug)}</h1>
          ${!side && i.title ? `<p class="subtitle">${esc(i.title)}</p>` : ''}
          <div class="hero-gate"><span class="gate-id">${esc(g.gate)}</span><span class="gate-name">${esc(stageName(g))}</span>${stateChip(g)}${i.blocked ? `<span class="chip-state st-blocked"><span aria-hidden="true">✕</span>blocked</span>` : ''}</div>
          <div class="progress-line"><strong>${c.done}</strong><span class="muted"> of ${c.total} tasks done</span>${c['in-progress'] ? ` <span class="sep">·</span> <span class="s-c-in-progress">${c['in-progress']} in progress</span>` : ''}${c.blocked ? ` <span class="sep">·</span> <span class="s-c-blocked">${c.blocked} blocked</span>` : ''}${i.tasksLive ? ' <span class="tag live-tag" title="Read from progress.md, which is newer than the index">live</span>' : ''}</div>
          ${bar(c)}
        </div>
        ${ring(c.done, c.total, side ? 64 : 104)}
      </div>
      ${side ? '' : pipeline(i)}
    </section>`;
  }

  function gateTip(g) {
    const f = g.findings;
    return [
      `${g.gate} ${stageName(g)} — ${g.label}${g.attempt && g.attempt > 1 ? ` (attempt ${g.attempt})` : ''}`,
      g.live ? `now: ${g.live.label} — ${g.live.note}` : '',
      g.blockedReason ? `blocked: ${g.blockedReason}` : '',
      g.skipReason ? `skipped: ${g.skipReason}` : '',
      ...g.staleBecause.map((s) => `stale: ${s}`),
      f.blocker + f.major + f.minor + f.info ? `findings — blocker ${f.blocker} · major ${f.major} · minor ${f.minor} · info ${f.info}` : '',
      g.updatedAt ? `updated ${g.updatedAt}` : '',
      g.live?.log || g.log ? 'click to open the log' : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** Wide: G0–G11 as a connected horizontal stepper. */
  function pipeline(i) {
    return `<ol class="pipeline" aria-label="Gates">${i.gates
      .map((g) => {
        const [icon, cls, word] = gateLook(g);
        const done = shown(g) === 'PASS' || shown(g) === 'SKIPPED';
        const log = g.live?.log ?? g.log;
        return `<li class="p-step ${cls} ${done ? 'done' : ''} ${g.gate === i.currentGate ? 'current' : ''}">
          <button class="p-body" ${log ? `data-path="${esc(log)}"` : 'disabled'} title="${esc(gateTip(g))}">
            <span class="node" aria-hidden="true">${icon}</span>
            <span class="p-gate">${esc(g.gate)}${g.open.length ? `<span class="p-count" title="${g.open.length} open finding(s)">${g.open.length}</span>` : ''}</span>
            <span class="p-stage">${esc(stageName(g))}</span>
            <span class="p-state">${esc(word)}${g.live ? ' <span class="tag live-tag">live</span>' : ''}</span>
          </button>
        </li>`;
      })
      .join('')}</ol>`;
  }

  /** Narrow: a vertical stepper, the shape a pipeline has when you read it top to bottom. */
  function stepper(i) {
    return section(
      'Gates',
      `${i.gates.filter((g) => shown(g) === 'PASS').length}/12 passed`,
      `<ol class="stepper">${i.gates
        .map((g) => {
          const [icon, cls, word] = gateLook(g);
          const log = g.live?.log ?? g.log;
          const done = shown(g) === 'PASS' || shown(g) === 'SKIPPED';
          return `<li class="step ${cls} ${done ? 'done' : ''} ${g.gate === i.currentGate ? 'current' : ''}">
            <span class="node" aria-hidden="true">${icon}</span>
            <button class="step-body" ${log ? `data-path="${esc(log)}"` : 'disabled'} title="${esc(gateTip(g))}">
              <span class="g">${esc(g.gate)}<span class="stage">${esc(stageName(g))}</span></span>
              <span class="state">${g.open.length ? `<span class="p-count">${g.open.length}</span>` : ''}${esc(word)}${g.live ? ' <span class="tag live-tag">live</span>' : ''}</span>
            </button>
          </li>`;
        })
        .join('')}</ol>`,
    );
  }

  function sevChips(i, clickable) {
    const s = i.severity;
    // Zero counts stay visible where the chips are a filter (so "0 blocker" reads as good news);
    // inside a tile only the severities present are drawn.
    const keys = ['blocker', 'major', 'minor', 'info', 'unknown'].filter((k) => s[k] || (clickable && (k === 'blocker' || k === 'major')));
    return `<span class="sev-chips">${keys
      .map((k) => {
        const [icon, cls, word] = SEV[k];
        const inner = `<span aria-hidden="true">${icon}</span>${s[k]} ${word}`;
        return clickable
          ? `<button class="sev ${cls} ${s[k] ? '' : 'zero'} ${ui.sev === k ? 'selected' : ''}" data-sev="${k}" aria-pressed="${ui.sev === k}">${inner}</button>`
          : `<span class="sev ${cls} ${s[k] ? '' : 'zero'}">${inner}</span>`;
      })
      .join('')}</span>`;
  }

  function kpis(i) {
    const c = i.counts;
    const g = currentGate(i);
    const of = i.openFindings.length;
    const r = i.requirements;
    const d = i.decisions;
    const tile = (label, value, sub, extra = '', attrs = '') =>
      `<${attrs ? 'button' : 'div'} class="kpi ${attrs ? 'clickable' : ''}" ${attrs}><span class="k-label">${label}</span><span class="k-value">${value}</span>${sub ? `<span class="k-sub">${sub}</span>` : ''}${extra}</${attrs ? 'button' : 'div'}>`;
    const tasks = tile('Tasks done', `${c.done}<small>/ ${c.total}</small>`, `${pct(c.done, c.total)}%${c['in-progress'] ? ` · ${c['in-progress']} in progress` : ''}${c.blocked ? ` · ${c.blocked} blocked` : ''}`, bar(c, 'thin'), 'data-filter="all" data-tab="tasks"');
    const findings = tile(
      'Open findings',
      `${of}`,
      of ? (i.severity.blocker + i.severity.major ? `<span class="s-c-blocked">${i.severity.blocker + i.severity.major} blocking</span>` : 'none blocking') : 'all clear',
      of ? sevChips(i, false) : '',
      layout === 'sidebar' ? 'data-tab="findings"' : '',
    );
    const gate = tile('Current gate', `${esc(g.gate)}<small>${esc(stageName(g))}</small>`, '', `<span class="k-chip">${stateChip(g)}</span>`);
    const attemptValue = i.attempt ?? '—';
    const attempt = tile('Attempt', `${attemptValue}`, i.attempt ? (i.attempt > 1 ? 'a second review round' : 'first review round') : `no ${esc(g.gate)} review yet`);
    const more =
      layout === 'page'
        ? tile('Requirements', `${r.covered}<small>/ ${r.total}</small>`, 'covered by a task', '', 'data-tab="reqs" data-scroll="reqs"') +
          tile('Decisions open', `${d.open}`, `${d.answered} answered${d.assumed ? ` · ${d.assumed} assumed` : ''}`)
        : '';
    return `<div class="kpis">${tasks}${findings}${gate}${attempt}${more}</div>`;
  }

  // ---- lists -------------------------------------------------------------------------------------

  function actionCards(i) {
    if (!i.actions.length) return '';
    return section(
      'What next',
      null,
      `<div class="actions">${i.actions
        .map((a) => {
          const [g, c] = ACTION[a.kind] ?? ['•', 'muted'];
          return `<div class="action ${c}">
            <span class="a-icon ${c}" aria-hidden="true">${g}</span>
            <div class="a-body">
              <div class="a-title">${esc(a.title)}</div>
              <div class="a-detail">${esc(a.detail)}</div>
              ${a.command || a.path ? `<div class="a-links">${a.command ? cmd(a.command) : ''}${a.path ? `<button class="link" data-path="${esc(a.path)}">Open log</button>` : ''}</div>` : ''}
            </div>
          </div>`;
        })
        .join('')}</div>`,
    );
  }

  function findingsList(i, limit) {
    const all = i.openFindings;
    if (!all.length) {
      return section('Open findings', '0', `<div class="empty-state ok"><span class="es-icon" aria-hidden="true">✓</span><div><strong>No open findings</strong><p>Every gate log in force is clean.</p></div></div>`);
    }
    const rows = all.filter((f) => ui.sev === 'all' || (f.severity ?? 'unknown') === ui.sev);
    const shownRows = rows.slice(0, limit);
    const body = `<ul class="findings">${shownRows
      .map((f) => {
        const [icon, cls, word] = SEV[f.severity ?? 'unknown'];
        return `<li ${f.log ? `class="row-btn" data-path="${esc(f.log)}" tabindex="0"` : ''}>
          <span class="sev ${cls}"><span aria-hidden="true">${icon}</span>${word}</span>
          <span class="f-main"><span class="f-id">${esc(f.id)}</span><span class="f-text">${esc(f.problem ?? `${f.gate} ${f.stage}`)}</span></span>
          <span class="gate-pill">${esc(f.gate)}</span>
        </li>`;
      })
      .join('')}</ul>${rows.length > shownRows.length ? `<div class="more">${rows.length - shownRows.length} more — the Open findings view lists every one</div>` : ''}${!rows.length ? '<div class="none">No finding of this severity.</div>' : ''}`;
    const filter = layout === 'page' ? sevChips(i, true) + (ui.sev !== 'all' ? `<button class="link plain" data-sev="all">clear</button>` : '') : '';
    return section('Open findings', `${all.length}`, body, filter);
  }

  function activityFeed(limit) {
    const items = (vm.live && vm.live.activity) || [];
    if (!items.length) {
      return section('Activity', null, `<div class="empty-state"><span class="es-icon" aria-hidden="true">◌</span><div><strong>No activity yet</strong><p>Commits, progress rows, gate logs and verification runs appear here as they are written.</p></div></div>`);
    }
    const keys = items.map((a) => `${a.kind}|${a.title}|${a.at}`);
    const fresh = seen ? new Set(keys.filter((k) => !seen.has(k))) : new Set();
    seen = new Set(keys);
    return section(
      'Activity',
      null,
      `<ol class="feed">${items
        .slice(0, limit)
        .map((a, n) => {
          const [icon, cls] = ACT[a.kind] ?? ['•', 'k-state'];
          const isCommit = a.kind === 'commit';
          return `<li class="${cls} ${fresh.has(keys[n]) ? 'fresh' : ''} ${a.path ? 'row-btn' : ''}" ${a.path ? `data-path="${esc(a.path)}" tabindex="0"` : ''}>
            <span class="f-node" aria-hidden="true">${icon}</span>
            <span class="f-body"><span class="f-title">${esc(a.title)}</span>${a.detail ? `<span class="f-detail ${isCommit ? 'mono' : ''}">${esc(a.detail)}</span>` : ''}</span>
            ${when(a.at)}
          </li>`;
        })
        .join('')}</ol>`,
      layout === 'sidebar' ? '' : `<span class="muted small">newest first</span>`,
    );
  }

  /** What the initiative does, where it is, and what comes next, in four lines. */
  function summary(i) {
    const g = currentGate(i);
    const passed = i.gates.filter((x) => x.state === 'PASS' || x.state === 'SKIPPED').length;
    return section(
      'Summary',
      null,
      `<dl class="summary">
        <dt>Does</dt><dd>${esc(i.title || i.slug)}</dd>
        <dt>Now</dt><dd><span class="gate-id">${esc(g.gate)}</span> ${esc(stageName(g))} ${stateChip(g)}</dd>
        <dt>Done</dt><dd>${i.percentDone}% <span class="muted">· ${passed} of ${i.gates.length} gates passed · ${i.counts.done} of ${i.counts.total} tasks</span></dd>
        <dt>Next</dt><dd>${esc(i.next)}</dd>
      </dl>
      <ol class="gate-strip" aria-label="Gates">${i.gates.map((x) => `<li class="st-${esc(String(x.state).toLowerCase().replace(/_/g, '-'))}" title="${esc(`${x.gate} ${x.stage}: ${x.label}`)}"><span>${esc(x.gate)}</span><small>${esc(x.label)}</small></li>`).join('')}</ol>`,
    );
  }

  /** Every DEC of the initiative: open first, then assumed (to confirm in one batch), then answered. */
  function decisionsList(i) {
    const list = i.decisions.list || [];
    if (!list.length) {
      return section('Decisions', '0', `<div class="empty-state ok"><span class="es-icon" aria-hidden="true">✓</span><div><strong>No decisions</strong><p>Questions only a human can answer are listed here as stages raise them.</p></div></div>`);
    }
    const groups = [
      ['open', 'Open', 'Answer these to unblock the gates they name.'],
      ['assumed', 'Assumed', 'Taken on the recommended default. Confirm them all in one pass.'],
      ['answered', 'Answered', ''],
      ['withdrawn', 'Withdrawn', ''],
    ];
    const body = groups
      .map(([status, label, hint]) => {
        const rows = list.filter((d) => d.status === status);
        if (!rows.length) return '';
        const batch = status === 'open' || status === 'assumed' ? cmd(`/sdlc-ask ${i.slug}`) : '';
        return `<h3 class="dec-group">${label} <span class="count">${rows.length}</span></h3>${hint ? `<p class="muted small">${esc(hint)} ${batch}</p>` : ''}
          <ul class="list dec-list">${rows
            .map((d) => {
              // A blocks cell can hold a sentence ("none — only the image tasks …"): the tag shows
              // the gate ids it names, the full text stays in the tooltip.
              const raw = d.blocks.join(', ');
              const gates = raw.match(/\bG\d+\b/g);
              // "none — …" blocks nothing, so it gets no tag; a sentence with no gate id gets a short
              // "blocks …" tag that only says there is a scope note, which the tooltip holds.
              const none = !gates && /^none\b/i.test(raw.trim());
              const shortBlocks = gates ? [...new Set(gates)].join(', ') : 'scope';
              const tag = raw && !none ? `<span class="tag ${d.blocking ? 'bad' : ''}" title="blocks ${esc(raw)}">blocks ${esc(shortBlocks)}</span>` : '';
              return `<li class="dec-row"><span class="id">${esc(d.id)}</span><span class="dec-text"><span class="dec-q">${esc(d.question)}</span>${d.answer ? `<span class="dec-a muted">→ ${esc(d.answer)}</span>` : ''}</span>${tag}</li>`;
            })
            .join('')}</ul>`;
      })
      .join('');
    return section('Decisions', `${list.length}`, body);
  }

  /** Everything waiting on a person: approvals, decisions, sign-offs, stopped runs, pushes. */
  function needsYou(i) {
    const items = i.needsYou || [];
    if (!items.length) {
      return section('Needs you', '0', `<div class="empty-state ok"><span class="es-icon" aria-hidden="true">✓</span><div><strong>Nothing waits on you</strong><p>UI approvals, decisions, sign-offs and stopped runs appear here.</p></div></div>`);
    }
    return section(
      'Needs you',
      `${items.length}`,
      `<ul class="list needs">${items
        .map((n) => `<li class="need-row ${n.link ? 'row-btn' : ''}" ${n.link ? `data-path="${esc(n.link)}" tabindex="0"` : ''}><span class="tag need-${esc(n.need)}">${esc(n.label)}</span><span class="need-title">${esc(n.title)}</span>${n.command || n.at ? `<span class="need-meta">${n.command ? cmd(n.command) : ''}${n.at ? when(n.at) : ''}</span>` : ''}</li>`)
        .join('')}</ul>`,
    );
  }

  function upNext(i) {
    if (!i.upNext.length) return '';
    return section(
      'Up next',
      null,
      `<ul class="list">${i.upNext
        .map(
          (t) => `<li class="row-btn" data-task="${esc(t.id)}" data-tab="tasks" tabindex="0">
            ${statusDot(t.status, true)}<span class="id">${esc(t.id)}</span>
            <span class="grow">${esc(t.title)}${t.blockedBy ? `<div class="small s-c-blocked">waiting: ${esc(t.blockedBy)}</div>` : ''}</span>
            ${t.stack ? `<span class="muted small">${esc(t.stack)}</span>` : ''}
          </li>`,
        )
        .join('')}</ul>`,
    );
  }

  // ---- tasks ----------------------------------------------------------------------------------

  function filteredTasks(i) {
    const q = ui.q.trim().toLowerCase();
    return i.tasks.filter(
      (t) =>
        (ui.filter === 'all' || t.status === ui.filter) &&
        (!ui.stack || (t.stack ?? '').split(/,\s*/).includes(ui.stack)) &&
        (!q || t.id.toLowerCase().includes(q) || t.full.toLowerCase().includes(q) || t.requirements.some((r) => r.id.toLowerCase().includes(q)) || t.files.some((f) => f.toLowerCase().includes(q))),
    );
  }

  function taskList(i) {
    if (!i.tasks.length) {
      return section('Tasks', '0', `<div class="empty-state"><span class="es-icon" aria-hidden="true">○</span><div><strong>No tasks yet</strong><p>They are created at G6 by <code>/sdlc-plan</code>.</p></div></div>`);
    }
    const c = i.counts;
    const stacks = [...new Set(i.tasks.flatMap((t) => (t.stack ?? '').split(/,\s*/).filter(Boolean)))].sort();
    const rows = filteredTasks(i);
    const chip = (key, label, n) => `<button class="chip ${ui.filter === key ? 'selected' : ''}" data-filter="${key}" aria-pressed="${ui.filter === key}">${label}<span class="n">${n}</span></button>`;
    const compact = layout === 'sidebar';
    const body = `
      <div class="toolbar">
        ${chip('all', 'All', c.total)}${TASK_ORDER.map((s) => chip(s, compact ? `<span aria-hidden="true">${TASK_GLYPH[s]}</span><span class="sr">${TASK_LABEL[s]}</span>` : `<span class="s-c-${s}" aria-hidden="true">${TASK_GLYPH[s]}</span>${TASK_LABEL[s]}`, c[s])).join('')}
        <span class="spacer"></span>
        ${stacks.length > 1 ? `<select id="stack" class="select" aria-label="Stack"><option value="">Any stack</option>${stacks.map((s) => `<option value="${esc(s)}" ${ui.stack === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>` : ''}
        <input id="q" type="search" placeholder="Search id, text, REQ, file…" value="${esc(ui.q)}" aria-label="Search tasks" />
      </div>
      ${
        rows.length
          ? compact
            ? `<ul class="list compact">${rows
                .map(
                  (t) => `<li class="row-btn ${t.id === ui.task ? 'selected' : ''}" data-task="${esc(t.id)}" tabindex="0">
                    ${statusDot(t.status, true)}<span class="id">${esc(t.id)}</span><span class="grow ellipsis">${esc(t.title)}</span>
                  </li>`,
                )
                .join('')}</ul>`
            : `<div class="table-wrap"><table class="tasks-table"><thead><tr><th>Status</th><th>Task</th><th></th><th class="r">Stack · REQ · tests</th></tr></thead><tbody>${rows
                .map(
                  (t) => `<tr class="row ${t.id === ui.task ? 'selected' : ''}" data-task="${esc(t.id)}" tabindex="0">
                    <td class="status">${statusDot(t.status)}</td>
                    <td class="id">${esc(t.id)}</td>
                    <td>${esc(t.title)}${t.blockedBy ? `<div class="small s-c-blocked">blocked by ${esc(t.blockedBy)}</div>` : ''}</td>
                    <td class="meta">${t.stack ? esc(t.stack) : '—'} · ${t.requirements.length} REQ · ${t.tests.length ? `${t.tests.length} test${t.tests.length > 1 ? 's' : ''}` : 'no test'}</td>
                  </tr>`,
                )
                .join('')}</tbody></table></div>`
          : `<div class="none">No task matches this filter.</div>`
      }
      <div class="foot-note">${rows.length} of ${c.total} shown${compact ? '' : ' · click a row for details'}</div>`;
    return compact ? body : section('Tasks', `${c.total}`, body);
  }

  function detail(i) {
    const t = i.tasks.find((x) => x.id === ui.task);
    if (!t) return '';
    const list = (items, render) => (items.length ? `<ul>${items.map(render).join('')}</ul>` : '<span class="muted">—</span>');
    const fileLink = (p) => `<li><button class="link mono" data-path="${esc(p)}" title="open">${esc(p)}</button></li>`;
    return `<aside class="detail">
      <div class="head">
        ${layout === 'sidebar' ? `<button class="back" data-close title="Back to the list">‹ Tasks</button>` : ''}
        <h3><span class="id">${esc(t.id)}</span> ${esc(t.title)}</h3>
        ${layout === 'page' ? `<button class="close" data-close title="Close (Esc)" aria-label="Close">×</button>` : ''}
      </div>
      <div class="detail-pills">${statusDot(t.status)}${t.stack ? `<span class="pill">${esc(t.stack)}</span>` : ''}</div>
      ${t.blockedBy ? `<div class="callout bad">Blocked by ${esc(t.blockedBy)}</div>` : ''}
      <dl>
        <dt>Description</dt><dd class="desc">${esc(t.full)}</dd>
        <dt>Done when</dt><dd>${t.doneWhen ? `<div class="callout">${esc(t.doneWhen)}</div>` : '<span class="muted">Not stated in the task — see the gate log for the acceptance criteria.</span>'}</dd>
        <dt>Requirements (${t.requirements.length})</dt><dd class="req">${list(t.requirements, (r) => `<li class="row-btn" data-req="${esc(r.id)}" data-tab="reqs" tabindex="0"><span class="id">${esc(r.id)}</span>${r.title ? `<span class="muted">${esc(r.title.length > 160 ? r.title.slice(0, 157) + '…' : r.title)}</span>` : ''}</li>`)}</dd>
        <dt>Files (${t.files.length})</dt><dd>${list(t.files, fileLink)}</dd>
        <dt>Tests (${t.tests.length})</dt><dd>${tests(t.tests)}</dd>
      </dl>
    </aside>`;
  }

  /**
   * The tests column in tasks.md is prose with file names in it, and the builder splits it on
   * commas. Paths stay links; prose is joined back into the sentence it was.
   */
  function tests(items) {
    if (!items.length) return '<span class="muted">None yet.</span>';
    const isPath = (x) => /[\/.]/.test(x) && !/\s/.test(x);
    if (items.every(isPath)) return `<ul>${items.map((p) => `<li><button class="link mono" data-path="${esc(p)}" title="open">${esc(p)}</button></li>`).join('')}</ul>`;
    const prose = esc(items.join(', ')).replace(/(^|[\s(])([\w./-]+\.(go|ts|tsx|js|mjs|py|sql|md|yaml|yml|json))\b/g, (m, pre, path) => `${pre}<button class="link mono" data-path="${path}">${path}</button>`);
    return `<div class="prose">${prose}</div>`;
  }

  function tasksSection(i) {
    if (layout === 'sidebar') return ui.task ? detail(i) : taskList(i);
    return `<div class="tasks ${ui.task ? 'with-detail' : ''}"><div class="tasks-main">${taskList(i)}</div>${detail(i)}</div>`;
  }

  // ---- requirements ---------------------------------------------------------------------------

  function requirements(i) {
    const all = i.requirementList;
    if (!all.length) return section('Requirements', '0', `<div class="empty-state"><span class="es-icon" aria-hidden="true">○</span><div><strong>No requirements yet</strong><p>They are written at G1 by <code>/sdlc-requirements</code>.</p></div></div>`);
    const prios = [...new Set(all.map((r) => r.priority).filter(Boolean))].sort();
    const rows = all.filter((r) => ui.reqFilter === 'all' || (ui.reqFilter === 'open' ? r.done < r.total || r.total === 0 : r.priority === ui.reqFilter));
    const chip = (key, label, n) => `<button class="chip ${ui.reqFilter === key ? 'selected' : ''}" data-req-filter="${key}" aria-pressed="${ui.reqFilter === key}">${label}<span class="n">${n}</span></button>`;
    const doneCount = all.filter((r) => r.total > 0 && r.done === r.total).length;
    const body = `
      <div class="toolbar">
        ${chip('all', 'All', all.length)}${chip('open', 'Not done', all.length - doneCount)}${prios.map((p) => chip(p, p, all.filter((r) => r.priority === p).length)).join('')}
      </div>
      <div class="foot-note top">${doneCount} of ${all.length} have every task done · ${i.requirements.covered} of ${i.requirements.total} covered by a task</div>
      <ul class="reqs">${rows
        .map((r) => {
          const open = ui.openReqs.includes(r.id);
          const full = r.total > 0 && r.done === r.total;
          return `<li class="req ${open ? 'open' : ''}">
            <button class="req-head" data-req="${esc(r.id)}" aria-expanded="${open}">
              <span class="caret" aria-hidden="true">${open ? '▾' : '▸'}</span>
              <span class="id">${esc(r.id)}</span>
              ${r.priority ? `<span class="pill ${r.priority === 'P0' ? 'accent' : ''}">${esc(r.priority)}</span>` : ''}
              <span class="grow title">${esc(r.title)}</span>
              <span class="frac ${full ? 's-c-done' : r.total ? '' : 's-c-blocked'}">${full ? '✓ ' : ''}${r.total ? `${r.done}/${r.total}` : 'no task'}</span>
              <span class="mini-bar" aria-hidden="true"><span style="width:${pct(r.done, r.total)}%"></span></span>
            </button>
            ${
              open
                ? `<ul class="req-tasks">${
                    r.tasks.length
                      ? r.tasks.map((t) => `<li class="row-btn" data-task="${esc(t.id)}" data-tab="tasks" tabindex="0">${statusDot(t.status, true)}<span class="id">${esc(t.id)}</span><span class="grow ellipsis">${esc(t.title)}</span></li>`).join('')
                      : '<li class="muted small">Not covered by any task — the G6 plan should say why.</li>'
                  }</ul>`
                : ''
            }
          </li>`;
        })
        .join('')}</ul>`;
    return layout === 'page' ? `<div id="reqs">${section('Requirements', `${all.length}`, body)}</div>` : body;
  }

  // ---- layouts --------------------------------------------------------------------------------

  function sidebarTabs(i) {
    const t = (key, label, n) => `<button class="vtab ${ui.tab === key ? 'selected' : ''}" data-tab="${key}" role="tab" aria-selected="${ui.tab === key}">${label}${n != null ? `<span class="n">${n}</span>` : ''}</button>`;
    const needs = (i.needsYou || []).length;
    return `<nav class="vtabs" role="tablist">${t('now', 'Summary', null)}${t('activity', 'Activity', null)}${t('decisions', 'Decisions', i.decisions.list.length)}${t('findings', 'Findings', i.openFindings.length)}${t('needs', 'Needs you', needs || null)}${t('tasks', 'Tasks', i.counts.total)}${agentsTab() ? `<button class="vtab ${ui.tab === 'agents' ? 'selected' : ''}" data-tab="agents" role="tab" aria-selected="${ui.tab === 'agents'}">Agents${agentsCount()}</button>` : ''}</nav>`;
  }

  function sidebar(i) {
    let body = '';
    if (ui.tab === 'tasks') body = tasksSection(i);
    else if (ui.tab === 'reqs') body = requirements(i);
    else if (ui.tab === 'findings') body = findingsList(i, 60);
    else if (ui.tab === 'activity') body = activityFeed(40);
    else if (ui.tab === 'decisions') body = decisionsList(i);
    else if (ui.tab === 'needs') body = needsYou(i);
    else if (ui.tab === 'agents' && agentsTab()) body = '<div id="ag-mount"></div>';
    else body = `${hero(i)}${needsYou(i)}${summary(i)}${actionCards(i)}${activityFeed(6)}${upNext(i)}`;
    return `${header()}${initiativeSwitch()}${sidebarTabs(i)}<div class="tabbody">${body}</div>
      <div class="footer"><button class="btn" data-open-board>Open the full board <span aria-hidden="true">→</span></button></div>`;
  }

  /** The full board has two views: the pipeline, and who is working on it right now. */
  function viewSwitch() {
    if (!agentsTab()) return '';
    const b = (key, label, extra = '') => `<button class="view-tab ${ui.view === key ? 'selected' : ''}" data-view="${key}" role="tab" aria-selected="${ui.view === key}">${label}${extra}</button>`;
    return `<nav class="view-tabs" role="tablist">${b('board', 'Board')}${b('agents', 'Agents', agentsCount())}</nav>`;
  }

  function page(i) {
    if (ui.view === 'agents' && agentsTab()) return `<div class="wrap">${header()}${viewSwitch()}<div id="ag-mount"></div></div>`;
    return `<div class="wrap">${header()}${viewSwitch()}${knowledge()}${initiativeSwitch()}${hero(i)}${kpis(i)}
      <div class="grid-2">
        <div class="col">${needsYou(i)}${summary(i)}${actionCards(i)}${findingsList(i, 8)}</div>
        <div class="col">${activityFeed(12)}${decisionsList(i)}${upNext(i)}</div>
      </div>
      ${tasksSection(i)}
      ${requirements(i)}</div>`;
  }

  function render() {
    if (!vm) return;
    if (!vm.ok) {
      app.className = 'empty-page';
      app.innerHTML = `<div class="empty-state big"><span class="es-icon warn" aria-hidden="true">!</span><div><strong>${esc(vm.reason)}</strong>${vm.detail ? `<p>${esc(vm.detail)}</p>` : ''}</div></div>`;
      mountAgents();
      return;
    }
    app.className = '';
    if (!vm.initiatives.length) {
      app.innerHTML = `<div class="wrap">${header()}${knowledge()}<div class="empty-state big"><span class="es-icon" aria-hidden="true">◆</span><div><strong>No initiatives yet</strong><p>This index is real and current — there is simply nothing in flight. Start one with <code>/sdlc-intake &lt;slug&gt; --class initiative</code>.</p></div></div></div>`;
      mountAgents();
      return;
    }
    const i = vm.initiatives.find((x) => x.slug === ui.slug) ?? vm.initiatives.find((x) => x.tasks.length) ?? vm.initiatives[0];
    ui.slug = i.slug;
    if (ui.task && !i.tasks.some((t) => t.id === ui.task)) ui.task = undefined;
    save();

    app.innerHTML = layout === 'sidebar' ? sidebar(i) : page(i);
    mountAgents();

    const q = /** @type {HTMLInputElement|null} */ (document.getElementById('q'));
    if (q) {
      q.addEventListener('input', () => {
        ui.q = q.value;
        save();
        const pos = q.selectionStart;
        render();
        const nq = /** @type {HTMLInputElement|null} */ (document.getElementById('q'));
        if (nq) {
          nq.focus();
          nq.setSelectionRange(pos, pos);
        }
      });
    }
    for (const [id, key] of [
      ['stack', 'stack'],
      ['slug', 'slug'],
    ]) {
      const sel = /** @type {HTMLSelectElement|null} */ (document.getElementById(id));
      if (sel) {
        sel.addEventListener('change', () => {
          ui[key] = sel.value;
          if (key === 'slug') ui.task = undefined;
          save();
          render();
        });
      }
    }
  }

  /** Re-word every relative time, and let the live pill go quiet when nothing has moved. */
  function tick() {
    for (const el of document.querySelectorAll('time[data-at]')) {
      const raw = el.getAttribute('data-at') ?? '';
      const at = /^\d+$/.test(raw) ? Number(raw) : raw;
      const text = ago(at);
      if (el.textContent !== text) el.textContent = text;
    }
    if (vm && vm.ok) {
      const pill = document.querySelector('.live');
      const on = isLive();
      if (pill && pill.classList.contains('on') !== on) render();
    }
  }
  setInterval(tick, 15000);

  // ---- events ---------------------------------------------------------------------------------

  document.addEventListener('click', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    // The Agents tab handles its own clicks (agents.js).
    if (el.closest('.ag')) return;
    const view = el.closest('[data-view]');
    if (view) {
      ui.view = view.getAttribute('data-view') === 'agents' ? 'agents' : 'board';
      save();
      render();
      return;
    }
    const copy = el.closest('[data-copy]');
    if (copy) {
      vscode.postMessage({ command: 'copy', text: copy.getAttribute('data-copy') });
      copy.textContent = '✓';
      setTimeout(() => (copy.textContent = '⧉'), 1200);
      return;
    }
    if (el.closest('[data-update]')) {
      vscode.postMessage({ command: 'update' });
      return;
    }
    if (el.closest('[data-open-board]')) {
      vscode.postMessage({ command: 'openBoard' });
      return;
    }
    const sev = el.closest('[data-sev]');
    if (sev) {
      const k = sev.getAttribute('data-sev') ?? 'all';
      ui.sev = ui.sev === k ? 'all' : k;
      save();
      render();
      return;
    }
    const pathEl = el.closest('[data-path]');
    if (pathEl && !el.closest('[data-task]')) {
      vscode.postMessage({ command: 'open', path: pathEl.getAttribute('data-path') });
      return;
    }
    const tab = el.closest('[data-slug]');
    if (tab) {
      ui.slug = tab.getAttribute('data-slug') ?? undefined;
      ui.task = undefined;
      save();
      render();
      return;
    }
    const reqHead = el.closest('.req-head[data-req]');
    if (reqHead) {
      const id = reqHead.getAttribute('data-req') ?? '';
      ui.openReqs = ui.openReqs.includes(id) ? ui.openReqs.filter((x) => x !== id) : [...ui.openReqs, id];
      save();
      render();
      return;
    }
    const reqLink = el.closest('[data-req]');
    if (reqLink) {
      const id = reqLink.getAttribute('data-req') ?? '';
      if (!ui.openReqs.includes(id)) ui.openReqs.push(id);
      ui.reqFilter = 'all';
      if (layout === 'sidebar') ui.tab = 'reqs';
      save();
      render();
      document.querySelector(`.req-head[data-req="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center' });
      return;
    }
    const reqFilter = el.closest('[data-req-filter]');
    if (reqFilter) {
      ui.reqFilter = reqFilter.getAttribute('data-req-filter') ?? 'all';
      save();
      render();
      return;
    }
    const row = el.closest('[data-task]');
    if (row) {
      const id = row.getAttribute('data-task') ?? undefined;
      ui.task = ui.task === id && !row.hasAttribute('data-tab') ? undefined : id;
      if (row.getAttribute('data-tab') === 'tasks' && layout === 'sidebar') ui.tab = 'tasks';
      save();
      render();
      if (layout === 'page') document.querySelector('.detail')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    const filter = el.closest('[data-filter]');
    if (filter) {
      ui.filter = filter.getAttribute('data-filter') ?? 'all';
      if (filter.getAttribute('data-tab') === 'tasks' && layout === 'sidebar') ui.tab = 'tasks';
      save();
      render();
      if (layout === 'page') document.querySelector('.tasks')?.scrollIntoView({ block: 'start' });
      return;
    }
    const scroll = el.closest('[data-scroll]');
    if (scroll && layout === 'page') {
      document.getElementById(scroll.getAttribute('data-scroll') ?? '')?.scrollIntoView({ block: 'start' });
      return;
    }
    const vtab = el.closest('[data-tab]');
    if (vtab) {
      ui.tab = vtab.getAttribute('data-tab') ?? 'now';
      save();
      render();
      return;
    }
    if (el.closest('[data-close]')) {
      ui.task = undefined;
      save();
      render();
    }
  });

  document.addEventListener('keydown', (e) => {
    const el = /** @type {HTMLElement} */ (e.target);
    if (e.key === 'Escape' && ui.task) {
      ui.task = undefined;
      save();
      render();
    }
    if (e.key === 'Enter' && el.matches('[data-task], [data-path], [data-req]')) el.click();
  });

  window.addEventListener('message', (e) => {
    if (e.data && e.data.command === 'state') {
      vm = e.data.vm;
      if (e.data.accent) document.body.dataset.accent = e.data.accent;
      if (e.data.addonVersion) addonVersion = e.data.addonVersion;
      update = e.data.update || null;
      agentsOn = !!e.data.agents;
      render();
    }
    if (e.data && e.data.command === 'tab' && e.data.tab === 'agents') {
      if (layout === 'sidebar') ui.tab = 'agents';
      else ui.view = 'agents';
      save();
      render();
    }
  });

  vscode.postMessage({ command: 'ready' });
})();
