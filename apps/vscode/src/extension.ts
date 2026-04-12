import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function getWorkspaceFolder(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function runCli(args: string[]): Promise<string> {
  const cwd = getWorkspaceFolder();
  const { stdout, stderr } = await execFileAsync('devflow', args, {
    cwd
  });
  return [stdout, stderr].filter(Boolean).join('\n').trim();
}

function createTreeProvider(title: string): vscode.TreeDataProvider<vscode.TreeItem> {
  return {
    getTreeItem(item) {
      return item;
    },
    getChildren() {
      return Promise.resolve([new vscode.TreeItem(title)]);
    }
  };
}

function showResultsPanel(title: string, body: string): void {
  const panel = vscode.window.createWebviewPanel(
    'devflow-results',
    title,
    vscode.ViewColumn.Beside,
    {
      enableFindWidget: true
    }
  );

  panel.webview.html = `<!doctype html>
  <html>
    <body style="font-family: sans-serif; padding: 20px;">
      <h2>${title}</h2>
      <pre style="white-space: pre-wrap;">${body.replace(
        /[<>&]/g,
        (char) =>
          ({
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;'
          })[char] ?? char
      )}</pre>
    </body>
  </html>`;
}

async function runAndShow(title: string, args: string[]) {
  try {
    const result = await runCli(args);
    showResultsPanel(title, result || 'No output returned from Devflow.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Devflow command failed: ${message}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'devflow.results',
      createTreeProvider('Latest review output')
    ),
    vscode.window.registerTreeDataProvider(
      'devflow.history',
      createTreeProvider('Synced review history')
    ),
    vscode.window.registerTreeDataProvider(
      'devflow.workspace',
      createTreeProvider('Active workspace')
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('devflow.reviewCurrentChanges', async () => {
      await runAndShow('Devflow Review', ['review']);
    }),
    vscode.commands.registerCommand('devflow.reviewStagedChanges', async () => {
      await runAndShow('Devflow Review (Staged)', ['review', '--staged']);
    }),
    vscode.commands.registerCommand('devflow.reviewSelectedFiles', async (uri?: vscode.Uri) => {
      const targets = uri?.fsPath
        ? [uri.fsPath]
        : vscode.window.activeTextEditor
          ? [vscode.window.activeTextEditor.document.fileName]
          : [];
      await runAndShow('Devflow Review (Selected Files)', ['review', '--files', ...targets]);
    }),
    vscode.commands.registerCommand('devflow.explainCurrentFile', async () => {
      const fileName = vscode.window.activeTextEditor?.document.fileName;
      if (!fileName) {
        void vscode.window.showWarningMessage('Open a file to explain it.');
        return;
      }
      await runAndShow('Devflow Explain', ['explain', fileName]);
    }),
    vscode.commands.registerCommand('devflow.generateTests', async () => {
      const fileName = vscode.window.activeTextEditor?.document.fileName;
      if (!fileName) {
        void vscode.window.showWarningMessage('Open a file to generate tests.');
        return;
      }
      await runAndShow('Devflow Tests', ['tests', fileName]);
    }),
    vscode.commands.registerCommand('devflow.openHistory', async () => {
      await runAndShow('Devflow History', ['history']);
    }),
    vscode.commands.registerCommand('devflow.openTeamRules', async () => {
      await vscode.env.openExternal(vscode.Uri.parse('http://localhost:3000/dashboard/policies'));
    }),
    vscode.commands.registerCommand('devflow.signIn', async () => {
      await runAndShow('Devflow Sign In', ['auth', 'login']);
    })
  );
}

export function deactivate() {
  // No-op for scaffold release.
}
