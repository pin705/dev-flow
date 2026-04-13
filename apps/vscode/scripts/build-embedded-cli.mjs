import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);
const extensionRoot = path.resolve(currentDirectoryPath, '..');
const workspaceRoot = path.resolve(extensionRoot, '..', '..');
const outputRoot = path.join(extensionRoot, 'dist', 'managed-cli');
const cliPackageJsonPath = path.join(workspaceRoot, 'apps', 'cli', 'package.json');
const cliEntrypointPath = path.join(workspaceRoot, 'apps', 'cli', 'src', 'index.ts');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const workspaceAliasEntries = [
  ['@diffmint/contracts', path.join(workspaceRoot, 'packages', 'contracts', 'src', 'index.ts')],
  [
    '@diffmint/policy-engine',
    path.join(workspaceRoot, 'packages', 'policy-engine', 'src', 'index.ts')
  ],
  ['@diffmint/review-core', path.join(workspaceRoot, 'packages', 'review-core', 'src', 'index.ts')]
];

const workspaceAliasPlugin = {
  name: 'workspace-alias',
  setup(pluginBuild) {
    for (const [request, filePath] of workspaceAliasEntries) {
      pluginBuild.onResolve({ filter: new RegExp(`^${escapeRegExp(request)}$`) }, () => ({
        path: filePath
      }));
    }
  }
};

const cliPackageJson = JSON.parse(await readFile(cliPackageJsonPath, 'utf8'));

await mkdir(path.join(outputRoot, 'cli'), { recursive: true });

await build({
  entryPoints: [cliEntrypointPath],
  outfile: path.join(outputRoot, 'cli', 'index.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  banner: {
    js: '#!/usr/bin/env node'
  },
  resolveExtensions: ['.ts', '.tsx', '.js', '.mjs', '.json'],
  plugins: [workspaceAliasPlugin]
});

await writeFile(
  path.join(outputRoot, 'package.json'),
  JSON.stringify(
    {
      name: '@diffmint/managed-cli',
      private: true,
      type: 'module',
      version: cliPackageJson.version ?? '0.1.0'
    },
    null,
    2
  ) + '\n',
  'utf8'
);
