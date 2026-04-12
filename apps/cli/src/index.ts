import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import {
  buildReviewRequest,
  createReviewSession,
  renderMarkdownSession,
  renderTerminalSession,
  runDoctor
} from '@devflow/review-core';

interface LocalConfig {
  apiBaseUrl?: string;
  provider?: string;
  workspace?: {
    id: string;
    name: string;
  };
  signedInAt?: string;
}

const DEVFLOW_HOME = path.join(homedir(), '.devflow');
const CONFIG_PATH = path.join(DEVFLOW_HOME, 'config.json');
const HISTORY_PATH = path.join(DEVFLOW_HOME, 'history.jsonl');

function ensureHome(): void {
  mkdirSync(DEVFLOW_HOME, { recursive: true });
}

function readConfig(): LocalConfig {
  ensureHome();
  if (!existsSync(CONFIG_PATH)) {
    return {};
  }

  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as LocalConfig;
}

function writeConfig(config: LocalConfig): void {
  ensureHome();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function appendHistory(record: unknown): void {
  ensureHome();
  const prefix = existsSync(HISTORY_PATH) ? readFileSync(HISTORY_PATH, 'utf8') : '';
  const next = `${prefix}${JSON.stringify(record)}\n`;
  writeFileSync(HISTORY_PATH, next, 'utf8');
}

function readHistory(): unknown[] {
  ensureHome();
  if (!existsSync(HISTORY_PATH)) {
    return [];
  }

  return readFileSync(HISTORY_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function printHelp(): void {
  console.log(`Devflow CLI

Usage:
  devflow auth login
  devflow auth logout
  devflow config set-provider <provider>
  devflow review [--staged] [--base <ref>] [--files <a> <b>] [--json] [--markdown]
  devflow explain <file>
  devflow tests <file>
  devflow history
  devflow doctor
`);
}

function parseFlags(args: string[]) {
  const flags = {
    staged: false,
    baseRef: undefined as string | undefined,
    files: [] as string[],
    json: false,
    markdown: false,
    mode: 'full'
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--staged') {
      flags.staged = true;
      continue;
    }
    if (arg === '--base') {
      flags.baseRef = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--mode') {
      flags.mode = args[index + 1] ?? 'full';
      index += 1;
      continue;
    }
    if (arg === '--json') {
      flags.json = true;
      continue;
    }
    if (arg === '--markdown') {
      flags.markdown = true;
      continue;
    }
    if (arg === '--files') {
      const files: string[] = [];
      let pointer = index + 1;
      while (pointer < args.length && !args[pointer].startsWith('--')) {
        files.push(args[pointer]);
        pointer += 1;
      }
      flags.files = files;
      index = pointer - 1;
    }
  }

  return flags;
}

function output(data: string | object, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

function explainFile(target: string): string {
  const absolute = path.resolve(process.cwd(), target);
  const source = readFileSync(absolute, 'utf8');
  const exportCount = [...source.matchAll(/^export\s/gm)].length;
  const lineCount = source.split('\n').length;
  const isClient = source.includes("'use client'") || source.includes('"use client"');

  return [
    `Explain: ${target}`,
    `- Lines: ${lineCount}`,
    `- Exports: ${exportCount}`,
    `- Runtime: ${isClient ? 'client component or browser-aware module' : 'server or shared module'}`,
    `- Suggested next step: run \`devflow tests ${target}\` if this file changes behavior or contracts.`
  ].join('\n');
}

function generateTests(target: string): string {
  const name = path.basename(target);
  return [
    `Suggested tests for ${name}`,
    `1. Covers the primary happy path for ${name}.`,
    `2. Validates error handling and empty-state behavior.`,
    `3. Verifies policy or auth boundaries if the file touches control-plane logic.`,
    `4. Confirms trace IDs or sync metadata are preserved when applicable.`
  ].join('\n');
}

async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  if (command === 'auth' && subcommand === 'login') {
    const config = readConfig();
    const nextConfig: LocalConfig = {
      ...config,
      apiBaseUrl: config.apiBaseUrl ?? process.env.DEVFLOW_API_BASE_URL ?? 'http://localhost:3000',
      workspace: config.workspace ?? {
        id: 'ws_local',
        name: 'Local Workspace'
      },
      signedInAt: new Date().toISOString()
    };
    writeConfig(nextConfig);
    console.log(`Signed in to Devflow.`);
    console.log(`Workspace: ${nextConfig.workspace?.name}`);
    console.log(`Control plane: ${nextConfig.apiBaseUrl}`);
    return;
  }

  if (command === 'auth' && subcommand === 'logout') {
    writeConfig({});
    console.log('Signed out from Devflow.');
    return;
  }

  if (command === 'config' && subcommand === 'set-provider') {
    const provider = rest[0];
    if (!provider) {
      throw new Error('Expected a provider name.');
    }
    const config = readConfig();
    writeConfig({
      ...config,
      provider
    });
    console.log(`Provider set to ${provider}.`);
    return;
  }

  if (command === 'review') {
    const config = readConfig();
    const flags = parseFlags([subcommand, ...rest].filter(Boolean));
    const source =
      flags.files.length > 0 ? 'selected_files' : flags.baseRef ? 'branch_compare' : 'local_diff';
    const request = buildReviewRequest({
      cwd: process.cwd(),
      source,
      baseRef: flags.baseRef,
      files: flags.files,
      staged: flags.staged,
      outputFormat: flags.json ? 'json' : flags.markdown ? 'markdown' : 'terminal',
      mode: flags.mode as never,
      provider: config.provider ?? 'qwen',
      model: 'qwen-code'
    });
    const session = createReviewSession(request);
    appendHistory(session);

    if (flags.json) {
      output(session, true);
      return;
    }

    if (flags.markdown) {
      console.log(renderMarkdownSession(session));
      return;
    }

    console.log(renderTerminalSession(request, session.findings));
    return;
  }

  if (command === 'history') {
    output(readHistory(), false);
    return;
  }

  if (command === 'doctor') {
    output(runDoctor(process.cwd()), false);
    return;
  }

  if (command === 'explain') {
    const target = subcommand;
    if (!target) {
      throw new Error('Expected a file path.');
    }
    console.log(explainFile(target));
    return;
  }

  if (command === 'tests') {
    const target = subcommand;
    if (!target) {
      throw new Error('Expected a file path.');
    }
    console.log(generateTests(target));
    return;
  }

  printHelp();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
