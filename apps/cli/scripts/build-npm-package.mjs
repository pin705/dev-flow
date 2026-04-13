import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectoryPath = path.dirname(currentFilePath);
const cliRoot = path.resolve(currentDirectoryPath, '..');
const workspaceRoot = path.resolve(cliRoot, '..', '..');
const outputRoot = path.join(cliRoot, 'dist', 'npm');
const entrypointPath = path.join(cliRoot, 'src', 'index.ts');
const sourcePackageJsonPath = path.join(cliRoot, 'package.json');
const readmePath = path.join(cliRoot, 'README.npm.md');
const licensePath = path.join(workspaceRoot, 'LICENSE');

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

const sourcePackageJson = JSON.parse(await readFile(sourcePackageJsonPath, 'utf8'));

await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.join(outputRoot, 'bin'), { recursive: true });

await build({
  entryPoints: [entrypointPath],
  outfile: path.join(outputRoot, 'bin', 'index.mjs'),
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
      name: '@unpijs/dm',
      version: sourcePackageJson.version ?? '0.1.0',
      description: 'Policy-driven local-first code review in the terminal.',
      type: 'module',
      license: 'MIT',
      homepage: 'https://diffmint.deplio.app',
      repository: {
        type: 'git',
        url: 'git+https://github.com/pin705/diffmint.git'
      },
      bugs: {
        url: 'https://github.com/pin705/diffmint/issues'
      },
      bin: {
        dm: './bin/index.mjs'
      },
      keywords: ['diffmint', 'cli', 'code-review', 'git', 'ai'],
      engines: {
        node: '>=20'
      },
      publishConfig: {
        access: 'public'
      }
    },
    null,
    2
  ) + '\n',
  'utf8'
);

await cp(readmePath, path.join(outputRoot, 'README.md'));
await cp(licensePath, path.join(outputRoot, 'LICENSE'));
