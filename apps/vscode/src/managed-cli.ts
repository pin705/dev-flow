import { constants as fsConstants, existsSync } from 'node:fs';
import { access, chmod, copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { getDiffmintHome } from './diffmint';

export interface ResolvedCliCommand {
  executable: string;
  prefixArgs: string[];
  displayPath: string;
  source: 'configured' | 'managed';
}

export interface ManagedCliInstallPaths {
  version: string;
  bundleRoot: string;
  bundlePackageJsonPath: string;
  bundleEntrypointPath: string;
  installRoot: string;
  installPackageJsonPath: string;
  installCliDirectoryPath: string;
  installEntrypointPath: string;
}

interface BundledCliPackageJson {
  version?: string;
}

export function getBundledCliPaths(extensionPath: string): {
  bundleRoot: string;
  bundlePackageJsonPath: string;
  bundleEntrypointPath: string;
} {
  const bundleRoot = path.join(extensionPath, 'dist', 'managed-cli');

  return {
    bundleRoot,
    bundlePackageJsonPath: path.join(bundleRoot, 'package.json'),
    bundleEntrypointPath: path.join(bundleRoot, 'cli', 'index.mjs')
  };
}

export async function readBundledCliVersion(extensionPath: string): Promise<string> {
  const { bundlePackageJsonPath } = getBundledCliPaths(extensionPath);

  let source: string;
  try {
    source = await readFile(bundlePackageJsonPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Bundled Diffmint CLI metadata is missing at "${bundlePackageJsonPath}". Rebuild the VS Code extension.`
    );
  }

  let parsed: BundledCliPackageJson;
  try {
    parsed = JSON.parse(source) as BundledCliPackageJson;
  } catch {
    throw new Error(
      `Bundled Diffmint CLI metadata at "${bundlePackageJsonPath}" could not be parsed. Rebuild the VS Code extension.`
    );
  }

  const version = parsed.version?.trim();
  if (!version) {
    throw new Error(
      `Bundled Diffmint CLI metadata at "${bundlePackageJsonPath}" does not include a version. Rebuild the VS Code extension.`
    );
  }

  return version;
}

export async function resolveManagedCliInstallPaths(
  extensionPath: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<ManagedCliInstallPaths> {
  const { bundleRoot, bundlePackageJsonPath, bundleEntrypointPath } =
    getBundledCliPaths(extensionPath);
  const version = await readBundledCliVersion(extensionPath);
  const installRoot = path.join(getDiffmintHome(env), 'managed-cli', version);

  return {
    version,
    bundleRoot,
    bundlePackageJsonPath,
    bundleEntrypointPath,
    installRoot,
    installPackageJsonPath: path.join(installRoot, 'package.json'),
    installCliDirectoryPath: path.join(installRoot, 'cli'),
    installEntrypointPath: path.join(installRoot, 'cli', 'index.mjs')
  };
}

export function isManagedCliInstalled(paths: ManagedCliInstallPaths): boolean {
  return existsSync(paths.installPackageJsonPath) && existsSync(paths.installEntrypointPath);
}

async function assertBundleReadable(filePath: string): Promise<void> {
  try {
    await access(filePath, fsConstants.R_OK);
  } catch {
    throw new Error(
      `Bundled Diffmint CLI asset is missing at "${filePath}". Rebuild the VS Code extension.`
    );
  }
}

export async function ensureManagedCliInstalled(options: {
  extensionPath: string;
  env?: NodeJS.ProcessEnv;
  forceInstall?: boolean;
  nodeExecutablePath?: string;
}): Promise<ResolvedCliCommand> {
  const paths = await resolveManagedCliInstallPaths(options.extensionPath, options.env);
  await assertBundleReadable(paths.bundlePackageJsonPath);
  await assertBundleReadable(paths.bundleEntrypointPath);

  if (options.forceInstall || !isManagedCliInstalled(paths)) {
    await mkdir(paths.installCliDirectoryPath, { recursive: true });
    await copyFile(paths.bundlePackageJsonPath, paths.installPackageJsonPath);
    await copyFile(paths.bundleEntrypointPath, paths.installEntrypointPath);
    await chmod(paths.installEntrypointPath, 0o755).catch(() => undefined);
  }

  return {
    executable: options.nodeExecutablePath ?? process.execPath,
    prefixArgs: [paths.installEntrypointPath],
    displayPath: paths.installEntrypointPath,
    source: 'managed'
  };
}
