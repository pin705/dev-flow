export interface DashboardAccessState {
  userId: string | null;
  orgId: string | null;
  requireWorkspace: boolean;
  signInUrl: string;
  workspaceSelectionUrl: string;
}

export function getDashboardRedirectTarget({
  userId,
  orgId,
  requireWorkspace,
  signInUrl,
  workspaceSelectionUrl
}: DashboardAccessState): string | null {
  if (!userId) {
    return signInUrl;
  }

  if (requireWorkspace && !orgId) {
    return workspaceSelectionUrl;
  }

  return null;
}
