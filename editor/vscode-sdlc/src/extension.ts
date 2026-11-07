/**
 * Activation, wiring, and the watchers. Nothing else belongs here.
 *
 * The extension is a viewer: it reads dev/state.json and the files the index is built from,
 * renders them, and reopens the files it points at. It never writes to the workspace and never runs
 * a pipeline command — with one opt-in exception, `sdlc.backgroundRebuild`, which runs the
 * project's own `build-state.mjs` exactly as the Stop hook would.
 * (`afx update --bundle dev` is only ever typed into a terminal after the reader confirms it.) That restraint is the feature:
 * the gate logs are an audit trail, and an editor plugin that could nudge them would make every
 * green board a little less believable.
 */

import * as cp from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentsFeed } from './agentsView';
import { BoardPanel, BoardSource, OverviewViewProvider, addonVersion, setAddonVersion } from './board';
import { Debouncer, LiveKind, LiveReader, LiveSnapshot, Throttle, classify, findGitDir, relativeTime } from './live';
import { LoadResult, ProjectRef, findProjectRootsAny, gateNumber, loadState, openFindingCount, resolveStatePath, shortTitle, stateCandidates, taskCounts } from './model';
import { DISMISS_KEY, UpdateNotice, readUpdateNotice, updateChoices, visibleNotice } from './updates';
import { buildViewModel } from './viewmodel';

/** Remembered per workspace, so reopening the window shows the project you last looked at. */
const SELECTED_KEY = 'sdlc.selectedProject';

export function activate(context: vscode.ExtensionContext): void {
  setAddonVersion(String(context.extension.packageJSON.version ?? ''));
  const folders = vscode.workspace.workspaceFolders ?? [];
  const folder = folders[0];
  if (!folder) return;

  const root = folder.uri;
  const config = (): vscode.WorkspaceConfiguration => vscode.workspace.getConfiguration('sdlc');
  // Empty setting = follow the bundle's root resolver: .sdlc/state.json, else dev/state.json (§2).
  // Projects are found under every root name, and each one's index path is resolved from its own
  // folder, so a parent workspace can hold a .sdlc/ project and a dev/ project side by side.
  const setting = (): string | undefined => config().get<string>('statePath');
  // Reassigned below, once selected() exists.
  let currentRoot = (): string => root.fsPath;
  const relPath = (): string => resolveStatePath(currentRoot(), setting());
  const devRoot = (): string => path.posix.dirname(relPath().replace(/\\/g, '/')) || '.sdlc';

  let cached: LoadResult | undefined;
  let liveCache: LiveSnapshot | undefined;
  let reader = new LiveReader(devRoot());
  let projects: ProjectRef[] | undefined;

  // A large workspace can hold several projects on the bundle - nested under one folder, or one per
  // workspace folder. All of them are offered by SDLC: Select Project; with no choice made, the most
  // recently built index wins, which is the project a command just ran in.
  const listProjects = (): ProjectRef[] => {
    if (!projects) {
      const seen = new Set<string>();
      projects = folders
        .flatMap((f) => findProjectRootsAny(f.uri.fsPath, stateCandidates(setting())))
        .filter((p) => !seen.has(p.root) && !!seen.add(p.root))
        .sort((a, b) => b.mtime - a.mtime);
    }
    return projects;
  };
  const selected = (): string | undefined => {
    const pinned = context.workspaceState.get<string>(SELECTED_KEY);
    const all = listProjects();
    if (pinned && all.some((p) => p.root === pinned)) return pinned;
    return all[0]?.root;
  };
  currentRoot = (): string => selected() ?? root.fsPath;
  const projectLabel = (projectRoot: string): string => {
    const owner = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(projectRoot));
    if (!owner) return path.basename(projectRoot);
    const rel = path.relative(owner.uri.fsPath, projectRoot).split(path.sep).join('/');
    return folders.length > 1 ? (rel ? `${owner.name}/${rel}` : owner.name) : rel || owner.name;
  };

  const getState = (): LoadResult => {
    if (!cached) cached = loadState(root.fsPath, relPath(), selected());
    return cached;
  };
  const getLive = (): LiveSnapshot | undefined => {
    const result = getState();
    if (!result.ok) return undefined;
    if (!liveCache) {
      try {
        liveCache = reader.snapshot(result.projectRoot, result.state);
      } catch {
        liveCache = undefined;
      }
    }
    return liveCache;
  };
  // The update notice: read from the file `afx` writes, never the network; hidden once dismissed.
  const getUpdate = (): UpdateNotice | null => {
    // The selected project's root (see SDLC: Select Project), not the workspace root.
    const result = getState();
    return visibleNotice(readUpdateNotice(result.ok ? result.projectRoot : selected() ?? root.fsPath), context.workspaceState.get<string>(DISMISS_KEY));
  };
  // Who is working on the project: Claude Code chats and the agents they spawned, read from their
  // transcripts (agents.ts) and drawn in the board's Agents tab.
  const agents = new AgentsFeed({
    projectRoot: () => {
      const result = getState();
      return result.ok ? result.projectRoot : selected() ?? root.fsPath;
    },
    itemTitles: () => {
      const result = getState();
      const out: Record<string, string> = {};
      if (result.ok) for (const i of result.state.initiatives) for (const t of i.tasks ?? []) out[t.id] = shortTitle(t.title);
      return out;
    },
  });
  context.subscriptions.push(agents);
  const source: BoardSource = {
    agents,
    state: getState,
    viewModel: () => buildViewModel(getState(), { live: getLive(), watching: true }),
    accent: () => config().get<string>('accent') ?? 'lavender',
    update: () => getUpdate(),
  };

  const overview = new OverviewViewProvider(context.extensionUri, source);
  context.subscriptions.push(vscode.window.registerWebviewViewProvider(OverviewViewProvider.viewType, overview));

  /** Name the project on the views only when there is a choice, so one project looks as it did. */
  const labelViews = (): void => {
    const current = selected();
    const many = listProjects().length > 1;
    const label = current && many ? projectLabel(current) : undefined;
    overview.setDescription(label);
    void vscode.commands.executeCommand('setContext', 'sdlc.multiProject', many);
  };

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'sdlc.openBoard';
  context.subscriptions.push(status);

  // Activation on onStartupFinished reaches windows with no project at all; those get no warning.
  const showStatus = (): void => {
    if (listProjects().length === 0) status.hide();
    else updateStatusBar(status, getState(), getLive(), source.accent());
  };

  /** Redraw everything. `stateChanged` false keeps the parsed index and only re-reads the live files. */
  const refresh = (stateChanged = true): void => {
    if (stateChanged) cached = undefined;
    liveCache = undefined;
    if (stateChanged) {
      labelViews();
      agents.refresh();
    }
    BoardPanel.refreshIfOpen();
    overview.refresh();
    showStatus();
  };

  // ---- the optional background rebuild ---------------------------------------------------------
  // Off by default, because it is the one path that writes to the workspace (the builder rewrites
  // state.json and DASHBOARD.md, as the Stop hook would). Throttled, and never two at once.
  const rebuild = new Throttle(
    () =>
      new Promise<void>((resolve) => {
        const result = getState();
        const cwd = result.ok ? result.projectRoot : root.fsPath;
        const script = path.join(cwd, devRoot(), 'scripts', 'build-state.mjs');
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        cp.execFile('node', [script], { cwd, env, timeout: 120_000, windowsHide: true }, () => resolve());
      }),
    Math.max(15, config().get<number>('backgroundRebuildSeconds') ?? 120) * 1000,
  );
  context.subscriptions.push({ dispose: () => rebuild.dispose() });

  // ---- watching ----------------------------------------------------------------------------------
  // Three watchers however big the project: one glob over the dev sources the board reads, one over
  // git's HEAD, reflog and branch refs, and the workspace-wide one that notices a state.json
  // appearing. Each event is classified (dot folders such as `.claude/worktrees` drop out there),
  // and the debouncer turns a burst into one redraw ~300 ms after the last write. No polling.
  const debouncer = new Debouncer<LiveKind>((kinds) => {
    refresh(kinds.has('state'));
    const sourcesChanged = [...kinds].some((k) => k !== 'state' && k !== 'git');
    if (sourcesChanged && config().get<boolean>('backgroundRebuild')) rebuild.request();
  }, 300);
  context.subscriptions.push({ dispose: () => debouncer.dispose() });

  let watchers: vscode.Disposable[] = [];
  let watchedRoot: string | undefined;
  const watch = (base: vscode.Uri, glob: string, toRel: (uri: vscode.Uri) => string): void => {
    const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(base, glob));
    const on = (uri: vscode.Uri): void => {
      const kind = classify(toRel(uri), devRoot());
      if (kind) debouncer.push(kind);
    };
    w.onDidChange(on);
    w.onDidCreate(on);
    w.onDidDelete(on);
    watchers.push(w);
  };
  const rootNames = (): string[] => stateCandidates(setting()).map((rel) => path.posix.dirname(rel.replace(/\\/g, '/')));
  const rewatch = (): void => {
    for (const w of watchers) w.dispose();
    watchers = [];
    const result = getState();
    const projectRoot = result.ok ? result.projectRoot : root.fsPath;
    watchedRoot = projectRoot;
    // The live reader follows the project's own root name, which may differ from the last one's.
    reader = new LiveReader(devRoot());
    liveCache = undefined;
    const d = devRoot();
    watch(
      vscode.Uri.file(projectRoot),
      `{${d}/state.json,${d}/implementation/*/progress.md,${d}/implementation/*/lanes/*.md,${d}/reviews/*/G*.md,${d}/verification/*/runs/**,${d}/decisions/*.md}`,
      (uri) => path.relative(projectRoot, uri.fsPath),
    );
    const gitDir = findGitDir(projectRoot);
    if (gitDir) {
      watch(vscode.Uri.file(gitDir), '{HEAD,logs/HEAD,refs/heads/**}', (uri) => `.git/${path.relative(gitDir, uri.fsPath).split(path.sep).join('/')}`);
    }
    // A project that appears, or another one rebuilt later, under a parent workspace.
    const onIndex = (uri: vscode.Uri): void => {
      // A dot folder other than the root itself (`.sdlc`, §2) holds copies — `.claude/worktrees`.
      if (vscode.workspace.asRelativePath(uri, false).split(/[\\/]/).some((part) => part.startsWith('.') && !rootNames().includes(part))) return;
      cached = undefined;
      projects = undefined;
      const after = getState();
      if ((after.ok ? after.projectRoot : root.fsPath) !== watchedRoot) rewatch();
      debouncer.push('state');
    };
    const indexGlob = stateCandidates(setting()).flatMap((rel) => [rel, `**/${rel}`]).join(',');
    for (const f of folders) {
      const discovery = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(f, `{${indexGlob}}`));
      discovery.onDidChange(onIndex);
      discovery.onDidCreate(onIndex);
      discovery.onDidDelete(onIndex);
      watchers.push(discovery);
    }
  };
  rewatch();
  context.subscriptions.push({ dispose: () => watchers.forEach((w) => w.dispose()) });
  // The update notice and the install manifest beside it, in any project of any folder: the pill
  // reads the selected project's copy each redraw, so any change just triggers one.
  const noticeGlob = '{.claude/.agentic-fx-updates.json,.claude/.agentic-fx.json,**/.claude/.agentic-fx-updates.json,**/.claude/.agentic-fx.json}';
  const onNotice = (): void => refresh(false);
  for (const f of folders) {
    const noticeWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(f, noticeGlob));
    noticeWatcher.onDidChange(onNotice);
    noticeWatcher.onDidCreate(onNotice);
    noticeWatcher.onDidDelete(onNotice);
    context.subscriptions.push(noticeWatcher);
  }

  const selectProject = async (): Promise<void> => {
    projects = undefined;
    const all = listProjects();
    if (all.length === 0) {
      void vscode.window.showInformationMessage(`No ${stateCandidates(setting()).join(' or ')} found in this workspace.`);
      return;
    }
    const pinned = context.workspaceState.get<string>(SELECTED_KEY);
    type Pick = vscode.QuickPickItem & { root?: string };
    const items: Pick[] = [
      {
        label: `${pinned ? '$(history)' : '$(pass-filled)'} Most recently updated`,
        description: projectLabel(all[0].root),
        detail: 'Follow whichever project a command last ran in.',
      },
      ...all.map((p) => ({
        label: `${p.root === pinned ? '$(pass-filled)' : '$(folder)'} ${projectLabel(p.root)}`,
        description: `updated ${relativeTime(p.mtime)}`,
        root: p.root,
      })),
    ];
    const choice = await vscode.window.showQuickPick(items, {
      title: 'SDLC: Select Project',
      placeHolder: `${all.length} project(s) on the SDLC bundle`,
      matchOnDescription: true,
    });
    if (!choice) return;
    await context.workspaceState.update(SELECTED_KEY, choice.root);
    cached = undefined;
    rewatch();
    refresh();
  };

  // The status bar's "2 min ago" ticks once a minute; the webviews tick on their own.
  const tick = setInterval(() => showStatus(), 60_000);
  context.subscriptions.push({ dispose: () => clearInterval(tick) });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('sdlc')) return;
      if (e.affectsConfiguration('sdlc.statePath')) {
        reader = new LiveReader(devRoot());
        cached = undefined;
        projects = undefined;
        rewatch();
      }
      refresh();
    }),
    vscode.commands.registerCommand('sdlc.refresh', () => {
      reader = new LiveReader(devRoot());
      projects = undefined;
      refresh();
    }),
    vscode.commands.registerCommand('sdlc.selectProject', selectProject),
    vscode.commands.registerCommand('sdlc.openBoard', () => BoardPanel.show(context, source)),
    vscode.commands.registerCommand('sdlc.openAgents', () => {
      BoardPanel.show(context, source);
      BoardPanel.showTab('agents');
    }),
    vscode.commands.registerCommand('sdlc.updateOptions', async () => {
      const notice = getUpdate();
      if (!notice) {
        void vscode.window.showInformationMessage('No update of the agentic-fx-dev bundle is known.');
        return;
      }
      const pick = await vscode.window.showQuickPick(
        updateChoices(notice).map((c) => ({ label: c.label, detail: c.detail, action: c.action })),
        { title: `agentic-fx-dev ${notice.latest} available (installed ${notice.installed}, ${notice.kind})`, placeHolder: 'What would you like to do?' },
      );
      if (!pick) return;
      if (pick.action === 'changelog') {
        void vscode.env.openExternal(vscode.Uri.parse(notice.changelogUrl));
      } else if (pick.action === 'run') {
        const go = await vscode.window.showWarningMessage(
          `Run \`${notice.command}\` in a new terminal?`,
          { modal: true, detail: notice.kind === 'major' ? 'This is a MAJOR version. Read UPGRADE.md first; commit or stash your work before updating.' : 'The installer replaces bundle files under .claude/ and dev/scripts/. Commit or stash your work first.' },
          'Run in terminal',
        );
        if (go !== 'Run in terminal') return;
        const result = getState();
        const terminal = vscode.window.createTerminal({ name: 'agentic-fx update', cwd: result.ok ? result.projectRoot : selected() ?? root.fsPath });
        terminal.show();
        terminal.sendText(notice.command);
      } else {
        await context.workspaceState.update(DISMISS_KEY, notice.latest);
        refresh(false);
      }
    }),
    vscode.commands.registerCommand('sdlc.openArtifact', (relative: string) => {
      const result = getState();
      const base = result.ok ? vscode.Uri.file(result.projectRoot) : root;
      void vscode.commands.executeCommand('vscode.open', vscode.Uri.joinPath(base, ...relative.split('/')));
    }),
  );

  refresh();
}

export function deactivate(): void {
  // Everything is a disposable on the context: watchers, timers, the throttle. No temp files.
}

/** An event within this window counts as "live" for the status-bar dot. */
const LIVE_WINDOW_MS = 10 * 60_000;

/**
 * The status bar answers the question people actually have between commands — "where is this, and
 * is anything stuck?" — without opening a view. It shows the initiative furthest along that is
 * still in flight, because that is almost always the one being worked on, in the accent colour,
 * with a filled dot while files are moving.
 */
function updateStatusBar(item: vscode.StatusBarItem, result: LoadResult, live: LiveSnapshot | undefined, accent: string): void {
  const enabled = vscode.workspace.getConfiguration('sdlc').get<boolean>('showStatusBar') ?? true;
  if (!enabled) {
    item.hide();
    return;
  }
  item.color = accent === 'theme' ? undefined : new vscode.ThemeColor('sdlc.accentForeground');

  if (!result.ok) {
    item.text = '$(warning) SDLC';
    item.color = undefined;
    item.tooltip = `${result.reason}${result.detail ? `\n${result.detail}` : ''}`;
    item.show();
    return;
  }

  const initiative = result.state.initiatives
    .filter((i) => gateNumber(i.current_gate) < 11)
    .sort((a, b) => gateNumber(b.current_gate) - gateNumber(a.current_gate))[0];

  if (!initiative) {
    item.text = '$(rocket) SDLC: idle';
    item.tooltip = 'No initiative in flight.';
    item.show();
    return;
  }

  const open = openFindingCount(initiative);
  const blockedStage = initiative.stages.find((s) => s.state === 'BLOCKED');
  const staleStage = initiative.stages.find((s) => s.state === 'STALE');
  const overlay = live?.slugs.get(initiative.slug)?.gates.get(initiative.current_gate);
  const current = initiative.stages.find((s) => s.gate === initiative.current_gate);
  const gateWord = (overlay?.state ?? current?.state ?? 'NOT_STARTED').replace(/_/g, ' ').toLowerCase();
  const last = live?.lastEventAt ?? null;
  const isLive = last !== null && Date.now() - last < LIVE_WINDOW_MS;
  const icon = blockedStage ? '$(error)' : staleStage ? '$(history)' : isLive ? '$(circle-filled)' : '$(circle-outline)';

  const c = taskCounts(initiative);
  const progress = c.total ? ` · ${c.done}/${c.total}` : '';
  item.text = `${icon} ${initiative.current_gate} ${gateWord} · ${initiative.slug}${progress}${open ? ` · ${open} open` : ''}`;
  const lastEvent = live?.activity[0];
  item.tooltip = new vscode.MarkdownString(
    [
      `**${initiative.title}**`,
      '',
      `- gate: ${initiative.current_gate} — ${gateWord}${overlay ? ` *(${overlay.source === 'log' ? 'from its newest gate log' : 'inferred from files'})*` : ''}`,
      c.total ? `- tasks: ${c.done} done · ${c['in-progress']} in progress · ${c.blocked} blocked · ${c.todo} todo` : '',
      `- open findings: ${open}`,
      blockedStage ? `- blocked at ${blockedStage.gate}: ${blockedStage.blocked_reason ?? ''}` : '',
      staleStage ? `- ${staleStage.gate} is stale — re-review or reaffirm` : '',
      lastEvent ? `- last event: ${lastEvent.title} · ${relativeTime(lastEvent.at)}` : '',
      live?.branch ? `- branch: ${live.branch}${live.head ? ` @ ${live.head}` : ''}` : '',
      `- versions: board ${addonVersion || '?'} · bundle ${result.state.generator_version ?? '?'}`,
      result.staleFiles.length ? `- index may be out of date (${result.staleFiles.length} file(s) changed)` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
  item.show();
}
