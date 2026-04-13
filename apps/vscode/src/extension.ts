import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  buildWebUrl,
  type DiffmintHistoryEntry,
  getDiffmintPaths,
  normalizeWebBaseUrl,
  readDiffmintConfig,
  readDiffmintHistory,
  renderResultHtml,
  tryParseJson
} from './diffmint';
import {
  renderDoctorChecksHtml,
  renderHistoryCompareHtml,
  renderHistoryHtml,
  renderPlainTextHtml,
  renderReviewSessionHtml,
  renderWorkspaceSummaryHtml
} from './render';
import { ensureManagedCliInstalled, type ResolvedCliCommand } from './managed-cli';
import type { DoctorCheckView, ReviewSessionView } from './types';

const execFileAsync = promisify(execFile);
const DEFAULT_CLI_PATH = 'dm';

interface LatestResult {
  title: string;
  body: string;
  updatedAt: string;
  html?: string;
}

interface RenderedResult {
  body: string;
  html?: string;
  reviewSession?: ReviewSessionView;
}

class DiffmintTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();

  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(private readonly loadItems: () => vscode.TreeItem[] | Promise<vscode.TreeItem[]>) {}

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(item: vscode.TreeItem): vscode.TreeItem {
    return item;
  }

  getChildren(): Promise<vscode.TreeItem[]> {
    return Promise.resolve(this.loadItems());
  }
}

function getWorkspaceFolder(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function getCliPath(): string {
  return (
    vscode.workspace.getConfiguration('diffmint').get<string>('cliPath')?.trim() || DEFAULT_CLI_PATH
  );
}

function getWebBaseUrl(): string {
  return normalizeWebBaseUrl(
    vscode.workspace.getConfiguration('diffmint').get<string>('webBaseUrl')
  );
}

async function executeCli(command: ResolvedCliCommand, args: string[]): Promise<string> {
  const cwd = getWorkspaceFolder();
  const { stdout, stderr } = await execFileAsync(
    command.executable,
    [...command.prefixArgs, ...args],
    {
      cwd,
      env: {
        ...process.env,
        DIFFMINT_API_BASE_URL: getWebBaseUrl()
      }
    }
  );
  return [stdout, stderr].filter(Boolean).join('\n').trim();
}

function createItem(
  label: string,
  options: {
    description?: string;
    tooltip?: string;
    command?: vscode.Command;
    iconPath?: vscode.ThemeIcon;
  } = {}
): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.description = options.description;
  item.tooltip = options.tooltip;
  item.command = options.command;
  item.iconPath = options.iconPath;
  return item;
}

function showResultsPanel(result: LatestResult): void {
  const panel = vscode.window.createWebviewPanel(
    'diffmint-results',
    result.title,
    vscode.ViewColumn.Beside,
    {
      enableFindWidget: true
    }
  );

  panel.webview.html = result.html ?? renderResultHtml(result.title, result.body);
}

function truncateText(value: string, maxLength = 84): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}

function resolveFindingUri(filePath: string): vscode.Uri | null {
  if (path.isAbsolute(filePath)) {
    return vscode.Uri.file(filePath);
  }

  const workspaceFolder = getWorkspaceFolder();
  if (!workspaceFolder) {
    return null;
  }

  return vscode.Uri.file(path.join(workspaceFolder, filePath));
}

function mapDiagnosticSeverity(
  severity: ReviewSessionView['findings'][number]['severity']
): vscode.DiagnosticSeverity {
  switch (severity) {
    case 'critical':
    case 'high':
      return vscode.DiagnosticSeverity.Error;
    case 'medium':
      return vscode.DiagnosticSeverity.Warning;
    default:
      return vscode.DiagnosticSeverity.Information;
  }
}

function applyReviewDiagnostics(
  session: ReviewSessionView,
  collection: vscode.DiagnosticCollection
): void {
  collection.clear();

  const diagnosticsByFile = new Map<string, vscode.Diagnostic[]>();

  for (const finding of session.findings) {
    if (!finding.filePath) {
      continue;
    }

    const uri = resolveFindingUri(finding.filePath);
    if (!uri) {
      continue;
    }

    const startLine = Math.max((finding.line ?? 1) - 1, 0);
    const endLine = Math.max((finding.endLine ?? finding.line ?? 1) - 1, startLine);
    const range = new vscode.Range(startLine, 0, endLine, 200);
    const messageLines = [finding.title, finding.summary];

    if (finding.suggestedAction) {
      messageLines.push(`Next: ${finding.suggestedAction}`);
    }

    const diagnostic = new vscode.Diagnostic(
      range,
      messageLines.join('\n'),
      mapDiagnosticSeverity(finding.severity)
    );
    diagnostic.source = 'Diffmint';
    diagnostic.code = finding.id;

    const key = uri.toString();
    const current = diagnosticsByFile.get(key) ?? [];
    current.push(diagnostic);
    diagnosticsByFile.set(key, current);
  }

  for (const [uri, diagnostics] of diagnosticsByFile.entries()) {
    collection.set(vscode.Uri.parse(uri), diagnostics);
  }
}

async function openFindingInEditor(finding: ReviewSessionView['findings'][number]): Promise<void> {
  if (!finding.filePath) {
    void vscode.window.showInformationMessage('This finding does not include a file location.');
    return;
  }

  const uri = resolveFindingUri(finding.filePath);

  if (!uri) {
    void vscode.window.showWarningMessage('Open the matching workspace to jump to this finding.');
    return;
  }

  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
  const line = Math.max((finding.line ?? 1) - 1, 0);
  const range = new vscode.Range(line, 0, line, 0);
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

function formatHistoryPickLabel(session: ReviewSessionView): string {
  return `${session.traceId} · ${truncateText(session.summary, 64)}`;
}

function updateStatusBar(item: vscode.StatusBarItem): void {
  const config = readDiffmintConfig(getDiffmintPaths().configPath);

  if (!config?.workspace) {
    item.text = '$(plug) Diffmint: Sign In';
    item.tooltip = 'Sign in to Diffmint';
    item.command = 'diffmint.signIn';
    return;
  }

  item.text = `$(plug) Diffmint: ${config.workspace.name}`;
  item.tooltip = `Workspace ${config.workspace.name}`;
  item.command = 'diffmint.openDashboard';
}

function renderReviewResult(raw: string): RenderedResult {
  const session = tryParseJson<ReviewSessionView>(raw);

  if (!session) {
    return {
      body: raw || 'No output returned from Diffmint.',
      html: renderPlainTextHtml(
        'Diffmint Review',
        raw || 'No output returned from Diffmint.',
        'The review result could not be parsed as structured JSON, so the raw CLI output is shown.'
      )
    };
  }

  return {
    body: session.summary,
    html: renderReviewSessionHtml(session),
    reviewSession: session
  };
}

function renderHistoryResult(raw: string): RenderedResult {
  const history = tryParseJson<DiffmintHistoryEntry[]>(raw);

  if (!history) {
    return {
      body: raw || 'No output returned from Diffmint.',
      html: renderPlainTextHtml(
        'Diffmint History',
        raw || 'No output returned from Diffmint.',
        'The history payload could not be parsed, so the raw CLI output is shown.'
      )
    };
  }

  return {
    body: `${history.length} review session(s)`,
    html: renderHistoryHtml(history)
  };
}

function renderDoctorResult(raw: string): RenderedResult {
  const checks = tryParseJson<DoctorCheckView[]>(raw);

  if (!checks) {
    return {
      body: raw || 'No output returned from Diffmint.',
      html: renderPlainTextHtml(
        'Diffmint Doctor',
        raw || 'No output returned from Diffmint.',
        'The doctor payload could not be parsed, so the raw CLI output is shown.'
      )
    };
  }

  return {
    body: `${checks.length} runtime check(s)`,
    html: renderDoctorChecksHtml(checks)
  };
}

function renderSignInResult(raw: string): RenderedResult {
  const config = readDiffmintConfig(getDiffmintPaths().configPath);

  return {
    body: config?.workspace ? `Signed in to ${config.workspace.name}` : raw,
    html: renderWorkspaceSummaryHtml(config, raw || 'No output returned from Diffmint.')
  };
}

async function loadReviewHistoryFromCli(
  runCli: (args: string[]) => Promise<string>
): Promise<ReviewSessionView[] | null> {
  const raw = await runCli(['history', '--json']);
  return tryParseJson<ReviewSessionView[]>(raw);
}

async function runAndShow(
  title: string,
  args: string[],
  runCli: (args: string[]) => Promise<string>,
  latestResultRef: { current: LatestResult | null },
  latestReviewRef: { current: ReviewSessionView | null },
  providers: DiffmintTreeProvider[],
  statusBar: vscode.StatusBarItem,
  diagnostics: vscode.DiagnosticCollection,
  options: {
    requireWorkspace?: boolean;
    render?: (raw: string) => RenderedResult;
  } = {}
) {
  if (options.requireWorkspace && !getWorkspaceFolder()) {
    void vscode.window.showWarningMessage('Open a workspace folder before running this command.');
    return;
  }

  try {
    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false
      },
      async () => runCli(args)
    );

    const rendered = options.render
      ? options.render(result)
      : {
          body: result || 'No output returned from Diffmint.'
        };

    latestResultRef.current = {
      title,
      body: rendered.body || 'No output returned from Diffmint.',
      html: rendered.html,
      updatedAt: new Date().toISOString()
    };

    if (rendered.reviewSession) {
      latestReviewRef.current = rendered.reviewSession;
      applyReviewDiagnostics(rendered.reviewSession, diagnostics);
    }

    providers.forEach((provider) => provider.refresh());
    updateStatusBar(statusBar);
    showResultsPanel(latestResultRef.current);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    const message = error instanceof Error ? error.message : String(error);

    if (nodeError?.code === 'ENOENT') {
      const action = await vscode.window.showErrorMessage(
        `Diffmint CLI was not found at "${getCliPath()}".`,
        'Open Install Guide'
      );

      if (action === 'Open Install Guide') {
        await vscode.env.openExternal(vscode.Uri.parse(buildWebUrl(getWebBaseUrl(), '/install')));
      }

      return;
    }

    void vscode.window.showErrorMessage(`Diffmint command failed: ${message}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const latestResultRef: { current: LatestResult | null } = {
    current: null
  };
  const latestReviewRef: { current: ReviewSessionView | null } = {
    current: null
  };
  const cliCommandRef: { current: ResolvedCliCommand | null } = {
    current: null
  };
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const diagnostics = vscode.languages.createDiagnosticCollection('diffmint');
  statusBar.show();

  async function installManagedCli(options: {
    forceInstall?: boolean;
    notify: 'auto' | 'manual' | 'repair';
  }): Promise<ResolvedCliCommand> {
    const managedCli = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title:
          options.notify === 'repair'
            ? 'Diffmint: Repairing bundled CLI'
            : 'Diffmint: Preparing bundled CLI',
        cancellable: false
      },
      async () =>
        ensureManagedCliInstalled({
          extensionPath: context.extensionPath,
          forceInstall: options.forceInstall
        })
    );

    cliCommandRef.current = managedCli;

    if (options.notify === 'auto') {
      void vscode.window.showInformationMessage(
        'Diffmint CLI was installed automatically for the VS Code extension.'
      );
    } else if (options.notify === 'manual') {
      void vscode.window.showInformationMessage(
        'Bundled Diffmint CLI is ready. Reset `diffmint.cliPath` to use the managed runtime.'
      );
    } else {
      void vscode.window.showInformationMessage('Bundled Diffmint CLI was repaired.');
    }

    return managedCli;
  }

  async function runCli(args: string[]): Promise<string> {
    const configuredPath = getCliPath();
    const configuredCommand: ResolvedCliCommand = {
      executable: configuredPath,
      prefixArgs: [],
      displayPath: configuredPath,
      source: 'configured'
    };
    const command =
      configuredPath === DEFAULT_CLI_PATH && cliCommandRef.current
        ? cliCommandRef.current
        : configuredCommand;

    try {
      return await executeCli(command, args);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      const canAutoInstall =
        configuredPath === DEFAULT_CLI_PATH &&
        (nodeError?.code === 'ENOENT' || nodeError?.code === 'EACCES');

      if (!canAutoInstall) {
        throw error;
      }

      const managedCli = await installManagedCli({
        forceInstall: command.source === 'managed',
        notify: command.source === 'managed' ? 'repair' : 'auto'
      });
      return executeCli(managedCli, args);
    }
  }

  const resultsProvider = new DiffmintTreeProvider(() => {
    if (!latestResultRef.current) {
      return [
        createItem('No results yet', {
          description: 'Run a review or history command',
          iconPath: new vscode.ThemeIcon('history')
        })
      ];
    }

    return [
      createItem(latestResultRef.current.title, {
        description: truncateText(latestResultRef.current.body),
        command: {
          command: 'diffmint.showLatestResult',
          title: 'Show Latest Result'
        },
        iconPath: new vscode.ThemeIcon('sparkle')
      })
    ];
  });

  const historyProvider = new DiffmintTreeProvider(() => {
    const history = readDiffmintHistory(getDiffmintPaths().historyPath, 5);

    if (history.length === 0) {
      return [
        createItem('No local history yet', {
          description: 'Run Diffmint Review or History',
          iconPath: new vscode.ThemeIcon('history')
        })
      ];
    }

    return history.map((entry) =>
      createItem(entry.traceId ?? 'Review session', {
        description: entry.severityCounts
          ? `H${entry.severityCounts.high ?? 0} M${entry.severityCounts.medium ?? 0} · ${truncateText(
              entry.summary ?? `${entry.commandSource ?? 'cli'} · ${entry.status ?? 'unknown'}`
            )}`
          : (entry.summary ?? `${entry.commandSource ?? 'cli'} · ${entry.status ?? 'unknown'}`),
        tooltip: entry.summary ?? entry.traceId,
        command: {
          command: 'diffmint.openHistory',
          title: 'Open Review History'
        },
        iconPath: new vscode.ThemeIcon('history')
      })
    );
  });

  const findingsProvider = new DiffmintTreeProvider(() => {
    const session = latestReviewRef.current;

    if (!session) {
      return [
        createItem('No findings yet', {
          description: 'Run a review to populate findings and diagnostics',
          iconPath: new vscode.ThemeIcon('search')
        })
      ];
    }

    if (session.findings.length === 0) {
      return [
        createItem('No actionable findings', {
          description: 'The latest review did not record any findings',
          iconPath: new vscode.ThemeIcon('check')
        })
      ];
    }

    return session.findings.map((finding) =>
      createItem(finding.title, {
        description: `${finding.severity.toUpperCase()} · ${
          finding.filePath
            ? `${finding.filePath}${finding.line ? `:${finding.line}` : ''}`
            : 'No file location'
        }`,
        tooltip: finding.summary,
        command: {
          command: 'diffmint.openFinding',
          title: 'Open Finding',
          arguments: [finding]
        },
        iconPath: new vscode.ThemeIcon(
          finding.severity === 'critical' || finding.severity === 'high'
            ? 'error'
            : finding.severity === 'medium'
              ? 'warning'
              : 'info'
        )
      })
    );
  });

  const actionsProvider = new DiffmintTreeProvider(() => [
    createItem('Sign In / Switch Workspace', {
      description: 'Connect the local CLI to the configured control plane',
      command: {
        command: 'diffmint.signIn',
        title: 'Sign In / Switch Workspace'
      },
      iconPath: new vscode.ThemeIcon('plug')
    }),
    createItem('Install / Repair CLI', {
      description: 'Prepare the bundled Diffmint CLI when `dm` is not available locally',
      command: {
        command: 'diffmint.installCli',
        title: 'Install / Repair CLI'
      },
      iconPath: new vscode.ThemeIcon('tools')
    }),
    createItem('Review Current Changes', {
      description: 'Run the default Diffmint review for the current working tree',
      command: {
        command: 'diffmint.reviewCurrentChanges',
        title: 'Review Current Changes'
      },
      iconPath: new vscode.ThemeIcon('sparkle')
    }),
    createItem('Review Staged Changes', {
      description: 'Limit the review to staged files',
      command: {
        command: 'diffmint.reviewStagedChanges',
        title: 'Review Staged Changes'
      },
      iconPath: new vscode.ThemeIcon('git-commit')
    }),
    createItem('Open Review History', {
      description: 'Inspect the grouped local and synced session list',
      command: {
        command: 'diffmint.openHistory',
        title: 'Open Review History'
      },
      iconPath: new vscode.ThemeIcon('history')
    }),
    createItem('Search Review History', {
      description: 'Filter history by trace, provider, policy, or finding text',
      command: {
        command: 'diffmint.searchHistory',
        title: 'Search Review History'
      },
      iconPath: new vscode.ThemeIcon('search')
    }),
    createItem('Compare Recent Sessions', {
      description: 'Pick two sessions and compare severity, scope, and finding deltas',
      command: {
        command: 'diffmint.compareHistory',
        title: 'Compare Recent Sessions'
      },
      iconPath: new vscode.ThemeIcon('split-horizontal')
    }),
    createItem('Run Doctor', {
      description: 'Check runtime, auth, and control-plane readiness',
      command: {
        command: 'diffmint.runDoctor',
        title: 'Run Doctor'
      },
      iconPath: new vscode.ThemeIcon('beaker')
    }),
    createItem('Open Team Rules', {
      description: 'Jump to policy configuration in the control plane',
      command: {
        command: 'diffmint.openTeamRules',
        title: 'Open Team Rules'
      },
      iconPath: new vscode.ThemeIcon('shield')
    })
  ]);

  const workspaceProvider = new DiffmintTreeProvider(() => {
    const config = readDiffmintConfig(getDiffmintPaths().configPath);
    const configuredCliPath = getCliPath();
    const cliItem =
      configuredCliPath === DEFAULT_CLI_PATH
        ? cliCommandRef.current?.source === 'managed'
          ? createItem('CLI: Managed runtime', {
              description: truncateText(cliCommandRef.current.displayPath, 56),
              iconPath: new vscode.ThemeIcon('tools')
            })
          : createItem('CLI: PATH lookup', {
              description: DEFAULT_CLI_PATH,
              iconPath: new vscode.ThemeIcon('terminal')
            })
        : createItem('CLI: Custom path', {
            description: truncateText(configuredCliPath, 56),
            iconPath: new vscode.ThemeIcon('terminal')
          });

    if (!config?.workspace) {
      return [
        cliItem,
        createItem('Not signed in', {
          description: 'Run Sign In / Switch Workspace',
          command: {
            command: 'diffmint.signIn',
            title: 'Sign In / Switch Workspace'
          },
          iconPath: new vscode.ThemeIcon('account')
        })
      ];
    }

    const syncLabel = config.syncDefaults?.cloudSyncEnabled === false ? 'Local-only' : 'Cloud sync';

    return [
      cliItem,
      createItem(config.workspace.name, {
        description: config.workspace.slug,
        command: {
          command: 'diffmint.openDashboard',
          title: 'Open Dashboard'
        },
        iconPath: new vscode.ThemeIcon('organization')
      }),
      createItem(`Provider: ${config.provider ?? 'unknown'}`, {
        iconPath: new vscode.ThemeIcon('server')
      }),
      createItem(`Policy: ${config.policyVersionId ?? 'not synced'}`, {
        iconPath: new vscode.ThemeIcon('shield')
      }),
      createItem(syncLabel, {
        description: config.signedInAt
          ? `Signed in ${new Date(config.signedInAt).toLocaleString()}`
          : undefined,
        iconPath: new vscode.ThemeIcon('sync')
      })
    ];
  });

  const providers = [
    resultsProvider,
    findingsProvider,
    historyProvider,
    workspaceProvider,
    actionsProvider
  ];
  updateStatusBar(statusBar);

  context.subscriptions.push(
    statusBar,
    diagnostics,
    vscode.window.registerTreeDataProvider('diffmint.findings', findingsProvider),
    vscode.window.registerTreeDataProvider('diffmint.results', resultsProvider),
    vscode.window.registerTreeDataProvider('diffmint.history', historyProvider),
    vscode.window.registerTreeDataProvider('diffmint.workspace', workspaceProvider),
    vscode.window.registerTreeDataProvider('diffmint.actions', actionsProvider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('diffmint')) {
        if (event.affectsConfiguration('diffmint.cliPath')) {
          cliCommandRef.current = null;
        }
        providers.forEach((provider) => provider.refresh());
        updateStatusBar(statusBar);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('diffmint.installCli', async () => {
      await installManagedCli({
        forceInstall: true,
        notify: 'manual'
      });
      providers.forEach((provider) => provider.refresh());
      updateStatusBar(statusBar);
    }),
    vscode.commands.registerCommand('diffmint.reviewCurrentChanges', async () => {
      await runAndShow(
        'Diffmint Review',
        ['review', '--json'],
        runCli,
        latestResultRef,
        latestReviewRef,
        providers,
        statusBar,
        diagnostics,
        {
          requireWorkspace: true,
          render: renderReviewResult
        }
      );
    }),
    vscode.commands.registerCommand('diffmint.reviewStagedChanges', async () => {
      await runAndShow(
        'Diffmint Review (Staged)',
        ['review', '--staged', '--json'],
        runCli,
        latestResultRef,
        latestReviewRef,
        providers,
        statusBar,
        diagnostics,
        {
          requireWorkspace: true,
          render: renderReviewResult
        }
      );
    }),
    vscode.commands.registerCommand('diffmint.reviewSelectedFiles', async (uri?: vscode.Uri) => {
      const targets = uri?.fsPath
        ? [uri.fsPath]
        : vscode.window.activeTextEditor
          ? [vscode.window.activeTextEditor.document.fileName]
          : [];
      if (targets.length === 0) {
        void vscode.window.showWarningMessage('Select or open a file to review it.');
        return;
      }
      await runAndShow(
        'Diffmint Review (Selected Files)',
        ['review', '--files', ...targets, '--json'],
        runCli,
        latestResultRef,
        latestReviewRef,
        providers,
        statusBar,
        diagnostics,
        {
          requireWorkspace: true,
          render: renderReviewResult
        }
      );
    }),
    vscode.commands.registerCommand('diffmint.explainCurrentFile', async () => {
      const fileName = vscode.window.activeTextEditor?.document.fileName;
      if (!fileName) {
        void vscode.window.showWarningMessage('Open a file to explain it.');
        return;
      }
      await runAndShow(
        'Diffmint Explain',
        ['explain', fileName],
        runCli,
        latestResultRef,
        latestReviewRef,
        providers,
        statusBar,
        diagnostics,
        {
          requireWorkspace: true,
          render: (raw) => ({
            body: raw || 'No output returned from Diffmint.',
            html: renderPlainTextHtml(
              'Diffmint Explain',
              raw || 'No output returned from Diffmint.',
              'The local CLI analyzed the current file and grouped the explanation into terminal-friendly sections.'
            )
          })
        }
      );
    }),
    vscode.commands.registerCommand('diffmint.generateTests', async () => {
      const fileName = vscode.window.activeTextEditor?.document.fileName;
      if (!fileName) {
        void vscode.window.showWarningMessage('Open a file to generate tests.');
        return;
      }
      await runAndShow(
        'Diffmint Tests',
        ['tests', fileName],
        runCli,
        latestResultRef,
        latestReviewRef,
        providers,
        statusBar,
        diagnostics,
        {
          requireWorkspace: true,
          render: (raw) => ({
            body: raw || 'No output returned from Diffmint.',
            html: renderPlainTextHtml(
              'Diffmint Tests',
              raw || 'No output returned from Diffmint.',
              'The local CLI produced a grouped test plan for the current file.'
            )
          })
        }
      );
    }),
    vscode.commands.registerCommand('diffmint.runDoctor', async () => {
      await runAndShow(
        'Diffmint Doctor',
        ['doctor', '--json'],
        runCli,
        latestResultRef,
        latestReviewRef,
        providers,
        statusBar,
        diagnostics,
        {
          render: renderDoctorResult
        }
      );
    }),
    vscode.commands.registerCommand('diffmint.openHistory', async () => {
      await runAndShow(
        'Diffmint History',
        ['history', '--json'],
        runCli,
        latestResultRef,
        latestReviewRef,
        providers,
        statusBar,
        diagnostics,
        {
          render: renderHistoryResult
        }
      );
    }),
    vscode.commands.registerCommand('diffmint.searchHistory', async () => {
      try {
        const query = await vscode.window.showInputBox({
          prompt: 'Search trace ID, summary, provider, policy, or finding text',
          placeHolder: 'auth, policy-v1, trace-123'
        });

        if (!query) {
          return;
        }

        const history = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Diffmint History Search',
            cancellable: false
          },
          async () => loadReviewHistoryFromCli(runCli)
        );

        if (!history) {
          void vscode.window.showErrorMessage('Unable to parse Diffmint history as JSON.');
          return;
        }

        const filtered = history.filter((session) =>
          [
            session.traceId,
            session.summary,
            session.provider,
            session.model,
            session.policyVersionId,
            session.source,
            session.commandSource,
            session.context?.fileSummary,
            ...session.findings.map((finding) => finding.title),
            ...session.findings.map((finding) => finding.summary)
          ]
            .filter(Boolean)
            .join('\n')
            .toLowerCase()
            .includes(query.toLowerCase())
        );

        latestResultRef.current = {
          title: `Diffmint History Search: ${query}`,
          body: `${filtered.length} matching review session(s)`,
          html: renderHistoryHtml(filtered),
          updatedAt: new Date().toISOString()
        };
        providers.forEach((provider) => provider.refresh());
        updateStatusBar(statusBar);
        showResultsPanel(latestResultRef.current);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Diffmint history search failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand('diffmint.compareHistory', async () => {
      try {
        const history = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Diffmint Compare History',
            cancellable: false
          },
          async () => loadReviewHistoryFromCli(runCli)
        );

        if (!history || history.length < 2) {
          void vscode.window.showInformationMessage(
            'Diffmint needs at least two review sessions to compare history.'
          );
          return;
        }

        const firstPick = await vscode.window.showQuickPick(
          history.map((session) => ({
            label: formatHistoryPickLabel(session),
            description: session.provider ?? 'unknown',
            session
          })),
          {
            placeHolder: 'Select the first review session'
          }
        );

        if (!firstPick) {
          return;
        }

        const secondPick = await vscode.window.showQuickPick(
          history
            .filter((session) => session.traceId !== firstPick.session.traceId)
            .map((session) => ({
              label: formatHistoryPickLabel(session),
              description: session.provider ?? 'unknown',
              session
            })),
          {
            placeHolder: 'Select the second review session'
          }
        );

        if (!secondPick) {
          return;
        }

        latestResultRef.current = {
          title: 'Diffmint History Compare',
          body: `${firstPick.session.traceId} vs ${secondPick.session.traceId}`,
          html: renderHistoryCompareHtml(firstPick.session, secondPick.session),
          updatedAt: new Date().toISOString()
        };
        providers.forEach((provider) => provider.refresh());
        updateStatusBar(statusBar);
        showResultsPanel(latestResultRef.current);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Diffmint history comparison failed: ${message}`);
      }
    }),
    vscode.commands.registerCommand(
      'diffmint.openFinding',
      async (finding: ReviewSessionView['findings'][number]) => {
        await openFindingInEditor(finding);
      }
    ),
    vscode.commands.registerCommand('diffmint.openTeamRules', async () => {
      await vscode.env.openExternal(
        vscode.Uri.parse(buildWebUrl(getWebBaseUrl(), '/dashboard/policies'))
      );
    }),
    vscode.commands.registerCommand('diffmint.signIn', async () => {
      await runAndShow(
        'Diffmint Sign In',
        ['auth', 'login'],
        runCli,
        latestResultRef,
        latestReviewRef,
        providers,
        statusBar,
        diagnostics,
        {
          render: renderSignInResult
        }
      );
    }),
    vscode.commands.registerCommand('diffmint.openDashboard', async () => {
      await vscode.env.openExternal(
        vscode.Uri.parse(buildWebUrl(getWebBaseUrl(), '/dashboard/overview'))
      );
    }),
    vscode.commands.registerCommand('diffmint.refreshViews', async () => {
      providers.forEach((provider) => provider.refresh());
      updateStatusBar(statusBar);
    }),
    vscode.commands.registerCommand('diffmint.showLatestResult', async () => {
      if (!latestResultRef.current) {
        void vscode.window.showInformationMessage('No Diffmint result is available yet.');
        return;
      }

      showResultsPanel(latestResultRef.current);
    })
  );
}

export function deactivate() {
  // No-op for scaffold release.
}
