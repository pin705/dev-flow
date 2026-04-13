# Diffmint VS Code Extension

The Diffmint extension runs the same review flow as the CLI, but it can now bootstrap a managed
CLI automatically when `dm` is not already installed on the machine.

## What it does

- runs review, explain, tests, and history commands through the local CLI
- auto-installs a bundled managed CLI on first use when `dm` is missing from the PATH
- shows grouped Diffmint views in the activity bar for quick actions, findings, history, results, and workspace state
- opens the latest review as editor diagnostics and a dedicated Findings list so you can jump straight to file and line
- supports history search and compare flows without leaving VS Code
- opens the web control plane for policies, docs, and workspace context

## Settings

- `diffmint.cliPath`: path to the `dm` binary. Leave the default to allow automatic fallback to the bundled managed CLI.
- `diffmint.webBaseUrl`: base URL for the Diffmint control plane

## Expected local setup

The extension still delegates execution to the CLI contract, but it no longer requires a manual CLI
install in the default case:

- if `dm` is already on PATH, the extension uses it
- if `diffmint.cliPath` points to a custom binary, the extension respects that
- if `diffmint.cliPath` is left at the default and `dm` is missing, the extension installs a managed CLI under `~/.diffmint/managed-cli`

Recent UX additions:

- automatic CLI bootstrap plus an explicit `Install / Repair CLI` command
- `Quick Actions` for sign-in, review, history, compare, and doctor flows
- `Findings` tree items that open the reported file and line
- grouped review webviews with scope, severity, findings, and code excerpts
- history search and side-by-side compare panels for local session triage

## Local build

```bash
pnpm --dir apps/vscode build
```

## Package a VSIX

```bash
pnpm --dir apps/vscode package
```
