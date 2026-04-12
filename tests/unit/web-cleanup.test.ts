import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { navGroups } from '../../apps/web/src/config/nav-config.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('web cleanup', () => {
  it('keeps only Devflow control-plane routes in primary navigation', () => {
    const urls = navGroups.flatMap((group) => group.items.map((item) => item.url));

    expect(urls).toEqual([
      '/dashboard/overview',
      '/dashboard/workspaces',
      '/dashboard/workspaces/team',
      '/dashboard/providers',
      '/dashboard/policies',
      '/dashboard/history',
      '/dashboard/audit',
      '/dashboard/docs',
      '/docs',
      '/install',
      '/dashboard/profile',
      '/dashboard/billing'
    ]);
  });

  it('removes starter-only routes and features from the repo', () => {
    const removedPaths = [
      'apps/web/src/app/dashboard/chat',
      'apps/web/src/app/dashboard/forms',
      'apps/web/src/app/dashboard/kanban',
      'apps/web/src/app/dashboard/notifications',
      'apps/web/src/app/dashboard/product',
      'apps/web/src/app/dashboard/react-query',
      'apps/web/src/app/dashboard/users',
      'apps/web/src/components/layout/cta-github.tsx',
      'apps/web/src/features/chat',
      'apps/web/src/features/forms',
      'apps/web/src/features/kanban',
      'apps/web/src/features/notifications',
      'apps/web/src/features/products',
      'apps/web/src/features/react-query-demo',
      'apps/web/src/features/users'
    ];

    for (const relativePath of removedPaths) {
      expect(existsSync(path.join(repoRoot, relativePath))).toBe(false);
    }
  });
});
