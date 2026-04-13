import { execFileSync } from 'node:child_process';
import {
  getAllDocs,
  getDocsNavigation,
  docSections,
  visibleDocSections
} from '../packages/docs-content/src/index.ts';

const docs = getAllDocs();
const hrefs = new Set(docs.map((doc) => doc.href));
const errors: string[] = [];

const navigation = getDocsNavigation();

for (const section of visibleDocSections) {
  if (!navigation.some((group) => group.section === section && group.items.length > 0)) {
    errors.push(`Missing docs for section: ${section}`);
  }
}

for (const doc of docs) {
  for (const href of [...doc.related, ...doc.internalLinks]) {
    if (href.startsWith('/docs/') && !hrefs.has(href)) {
      errors.push(`Broken docs link in ${doc.slug}: ${href}`);
    }
  }
}

const allowedCommandPrefixes = [
  'dm auth login',
  'dm auth logout',
  'dm config set-provider',
  'dm review',
  'dm explain',
  'dm tests',
  'dm history',
  'dm doctor',
  'pnpm install',
  'pnpm docker:dev',
  'pnpm docker:dev:logs',
  'pnpm docker:dev:down',
  'pnpm docker:dev:reset',
  'pnpm db:generate'
];

for (const doc of docs) {
  const bashBlocks = [...doc.body.matchAll(/```bash\n([\s\S]*?)```/g)];
  for (const block of bashBlocks) {
    const lines = block[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      const normalized = line.replace(/\s+/g, ' ');
      if (
        normalized.startsWith('diffmint ') &&
        !allowedCommandPrefixes.some((prefix) => normalized.startsWith(prefix))
      ) {
        errors.push(`Unknown CLI example in ${doc.slug}: ${normalized}`);
      }
    }
  }
}

try {
  const changedFiles = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    encoding: 'utf8'
  })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const normalizedFiles = changedFiles.map((line) => line.slice(3));

  const userFacingChanged = normalizedFiles.some((file) =>
    [
      'apps/web/src/',
      'apps/cli/',
      'apps/vscode/',
      'packages/contracts/',
      'packages/review-core/',
      'packages/policy-engine/'
    ].some((prefix) => file.startsWith(prefix))
  );

  const hasChangelogChange = normalizedFiles.some((file) =>
    file.startsWith('packages/docs-content/content/changelog/')
  );

  if (userFacingChanged && !hasChangelogChange) {
    errors.push('User-facing changes detected without a changelog entry in packages/docs-content/content/changelog/.');
  }
} catch {
  // Ignore git diff checks outside git or when HEAD is unavailable.
}

if (errors.length > 0) {
  console.error('Docs checks failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Docs checks passed for ${docs.length} pages.`);
