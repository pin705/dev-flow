import { describe, expect, it } from 'vitest';
import { getDashboardRedirectTarget } from '../../apps/web/src/features/control-plane/server/access-rules.ts';

describe('dashboard access rules', () => {
  it('sends unauthenticated traffic to sign-in', () => {
    expect(
      getDashboardRedirectTarget({
        userId: null,
        orgId: null,
        requireWorkspace: false,
        signInUrl: '/auth/sign-in',
        workspaceSelectionUrl: '/dashboard/workspaces'
      })
    ).toBe('/auth/sign-in');
  });

  it('sends authenticated users without an active workspace to workspace selection when required', () => {
    expect(
      getDashboardRedirectTarget({
        userId: 'user_123',
        orgId: null,
        requireWorkspace: true,
        signInUrl: '/auth/sign-in',
        workspaceSelectionUrl: '/dashboard/workspaces'
      })
    ).toBe('/dashboard/workspaces');
  });

  it('allows dashboard access when the user and workspace are present', () => {
    expect(
      getDashboardRedirectTarget({
        userId: 'user_123',
        orgId: 'org_456',
        requireWorkspace: true,
        signInUrl: '/auth/sign-in',
        workspaceSelectionUrl: '/dashboard/workspaces'
      })
    ).toBeNull();
  });
});
