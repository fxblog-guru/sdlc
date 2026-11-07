/**
 * The two webviews — the sidebar Overview and the full-width Board tab — share one host.
 *
 * The extension side turns the index into a view model (`viewmodel.ts`) and posts it to the page.
 * The page (`media/board.js`) only draws it and keeps the reader's place: which initiative, which
 * tab, which task, which filter. Splitting it this way keeps every derived value in TypeScript
 * where `model.test.ts` can reach it, and lets a refresh arrive as a message instead of a page
 * reload, so a click on a task survives the index being rebuilt underneath it.
 *
 * Everything rendered is read straight from state.json. The board computes no verdict, applies no
 * threshold, and parses no markdown — if something looks wrong here, the bug is in the builder or
 * in a gate log, and that is exactly where you want to be sent. It also never runs a pipeline
 * command: a suggested command is shown and copied, nothing more.
 */

import * as vscode from 'vscode';
import { AgentsFeed } from './agentsView';
import { LoadResult } from './model';
import { BoardVM } from './viewmodel';
import { UpdateNotice, noticeLabel } from './updates';

export type Layout = 'page' | 'sidebar';

/** The installed addon's version, set once at activation and shown in the board header. */
export let addonVersion = '';
export function setAddonVersion(v: string): void {
  addonVersion = v;
}

/** What a webview needs from the host: the index (to resolve paths), the view model, the accent. */
export interface BoardSource {
  state(): LoadResult;
  viewModel(): BoardVM;
  accent(): string;
  /** A known, not dismissed update of the dev bundle, read from the file `afx` writes; or null. */
  update?(): UpdateNotice | null;
  /** Feeds the Agents tab; without it the tab is not offered. */
  agents?: AgentsFeed;
}

/** The accent names the page knows; anything else falls back to the default. */
export const ACCENTS = ['lavender', 'purple', 'theme'];

/** Wires one webview to the page script and answers its messages. */
class BoardHost {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly webview: vscode.Webview,
    extensionUri: vscode.Uri,
    private readonly source: BoardSource,
    layout: Layout,
  ) {
    webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')] };
    webview.html = this.shell(extensionUri, layout);
    if (source.agents) this.disposables.push(source.agents.attach(webview));
    webview.onDidReceiveMessage(
      (msg: { command: string; path?: string; text?: string }) => {
        if (msg.command === 'ready') this.render();
        if (msg.command === 'open' && msg.path) {
          const result = this.source.state();
          if (!result.ok) return;
          const uri = vscode.Uri.joinPath(vscode.Uri.file(result.projectRoot), ...msg.path.split('/'));
          void vscode.commands.executeCommand('vscode.open', uri);
        }
        if (msg.command === 'copy' && msg.text) {
          void vscode.env.clipboard.writeText(msg.text).then(() => {
            vscode.window.setStatusBarMessage(`Copied: ${msg.text}`, 2500);
          });
        }
        if (msg.command === 'openBoard') void vscode.commands.executeCommand('sdlc.openBoard');
        if (msg.command === 'update') void vscode.commands.executeCommand('sdlc.updateOptions');
      },
      null,
      this.disposables,
    );
  }

  render(): void {
    const accent = ACCENTS.includes(this.source.accent()) ? this.source.accent() : 'lavender';
    const notice = this.source.update?.() ?? null;
    const update = notice ? { latest: notice.latest, installed: notice.installed, kind: notice.kind, ...noticeLabel(notice) } : null;
    void this.webview.postMessage({ command: 'state', vm: this.source.viewModel(), accent, addonVersion, update, agents: !!this.source.agents });
  }

  showTab(tab: string): void {
    void this.webview.postMessage({ command: 'tab', tab });
  }

  dispose(): void {
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }

  private shell(extensionUri: vscode.Uri, layout: Layout): string {
    const script = this.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'board.js'));
    const style = this.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'board.css'));
    const time = this.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'reltime.js'));
    const agentsScript = this.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'agents.js'));
    const agentsStyle = this.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'agents.css'));
    const accent = ACCENTS.includes(this.source.accent()) ? this.source.accent() : 'lavender';
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${this.webview.cspSource}; script-src ${this.webview.cspSource};" />
<link rel="stylesheet" href="${style}" />
<link rel="stylesheet" href="${agentsStyle}" />
<title>SDLC</title>
</head>
<body data-layout="${layout}" data-accent="${accent}">
<div id="app" class="empty">Loading the index…</div>
<script src="${time}"></script>
<script src="${agentsScript}"></script>
<script src="${script}"></script>
</body>
</html>`;
  }
}

/** The full-width board, opened as an editor tab. */
export class BoardPanel {
  private static current: BoardPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly host: BoardHost;

  static show(context: vscode.ExtensionContext, source: BoardSource): BoardPanel {
    if (BoardPanel.current) {
      BoardPanel.current.panel.reveal(vscode.ViewColumn.One);
      BoardPanel.current.host.render();
      return BoardPanel.current;
    }
    BoardPanel.current = new BoardPanel(context, source);
    return BoardPanel.current;
  }

  static refreshIfOpen(): void {
    BoardPanel.current?.host.render();
  }

  /** Switch the open board to a tab, e.g. `agents` from SDLC: Open Agents. */
  static showTab(tab: string): void {
    BoardPanel.current?.host.showTab(tab);
  }

  private constructor(context: vscode.ExtensionContext, source: BoardSource) {
    this.panel = vscode.window.createWebviewPanel('sdlc.board', 'SDLC Board', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
    });
    this.host = new BoardHost(this.panel.webview, context.extensionUri, source, 'page');
    this.panel.onDidDispose(() => {
      BoardPanel.current = undefined;
      this.host.dispose();
    });
  }
}

/**
 * The sidebar Overview: the same page in its narrow layout, always one click away while coding.
 * This is the view people glance at between commands, so it leads with where the initiative is
 * and what is waiting, and keeps the long lists behind tabs.
 */
export class OverviewViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = 'sdlc.overview';
  private host: BoardHost | undefined;
  private view: vscode.WebviewView | undefined;
  private description: string | undefined;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly source: BoardSource,
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.host?.dispose();
    this.host = new BoardHost(view.webview, this.extensionUri, this.source, 'sidebar');
    this.view = view;
    view.description = this.description;
    view.onDidDispose(() => {
      this.host?.dispose();
      this.host = undefined;
      this.view = undefined;
    });
    // A hidden view keeps its DOM only while VS Code chooses to; when it comes back, the page asks
    // for the index again with a `ready` message, so nothing here needs to track visibility.
  }

  refresh(): void {
    this.host?.render();
  }

  /** Which project is on show, when the workspace holds more than one. */
  setDescription(description: string | undefined): void {
    this.description = description;
    if (this.view) this.view.description = description;
  }
}
