import type {
  PolicyBundle,
  ProviderConfigSummary,
  ReleaseManifest,
  ReviewSession,
  UsageEvent,
  WorkspaceBootstrap
} from '@diffmint/contracts';
import type { BillingPlanKey, BillingSubscriptionStatus } from '@/lib/billing/adapter';
import { createDefaultPolicyBundle } from '@diffmint/policy-engine';

const workspaceId = 'ws_diffmint_core';

export interface AuditEventRecord {
  id: string;
  event: string;
  actor: string;
  target: string;
  when: string;
  detail: string;
}

export interface OverviewStat {
  label: string;
  value: string;
  helper: string;
}

export interface BillingWorkspaceSeed {
  workspaceId: string;
  workspaceName: string;
  customerId?: string;
  planKey: BillingPlanKey;
  subscriptionStatus: BillingSubscriptionStatus;
  seatsUsed: number;
  seatLimit: number;
  creditsIncluded: number;
  creditsRemaining: number;
  spendCapUsd: number;
}

export const workspaceSeed: WorkspaceBootstrap['workspace'] = {
  id: workspaceId,
  slug: 'diffmint-core',
  name: 'Diffmint Core'
};

export const workspaceRole: WorkspaceBootstrap['role'] = 'owner';

export const workspaceQuotas: WorkspaceBootstrap['quotas'] = {
  includedCredits: 0,
  remainingCredits: 0,
  seats: 0,
  seatLimit: 0,
  spendCapUsd: 0
};

export const workspaceSyncDefaults: WorkspaceBootstrap['syncDefaults'] = {
  cloudSyncEnabled: true,
  localOnlyDefault: false,
  redactionEnabled: true
};

export const providerSummaries: ProviderConfigSummary[] = [
  {
    id: 'provider-byok-codex',
    provider: 'codex',
    mode: 'byok',
    defaultModel: 'gpt-5-codex',
    allowedModels: ['gpt-5-codex', 'gpt-5.4', 'gpt-5.4-mini'],
    encrypted: false,
    updatedAt: '2026-04-13T00:00:00.000Z'
  },
  {
    id: 'provider-byok-antigravity',
    provider: 'antigravity',
    mode: 'byok',
    defaultModel: 'antigravity-agent',
    allowedModels: ['antigravity-agent'],
    encrypted: false,
    updatedAt: '2026-04-13T00:00:00.000Z'
  },
  {
    id: 'provider-byok-api',
    provider: 'api',
    mode: 'byok',
    defaultModel: 'user-configured',
    allowedModels: ['user-configured'],
    encrypted: false,
    updatedAt: '2026-04-13T00:00:00.000Z'
  }
];

const defaultPolicy = createDefaultPolicyBundle(workspaceId);

export const policyBundles: PolicyBundle[] = [defaultPolicy];

export const reviewSessions: ReviewSession[] = [];

export const releaseManifests: ReleaseManifest[] = [];

export const usageEvents: UsageEvent[] = [];

export const billingWorkspaceSeed: BillingWorkspaceSeed = {
  workspaceId,
  workspaceName: workspaceSeed.name,
  planKey: 'free',
  subscriptionStatus: 'active',
  seatsUsed: 0,
  seatLimit: 0,
  creditsIncluded: 0,
  creditsRemaining: 0,
  spendCapUsd: 0
};

export const auditEvents: AuditEventRecord[] = [];

export const overviewStats: OverviewStat[] = [
  {
    label: 'Synced reviews',
    value: '0',
    helper: 'No synced reviews yet'
  },
  {
    label: 'Active seats',
    value: '0 / 0',
    helper: 'Free workspace'
  },
  {
    label: 'Published policies',
    value: '1',
    helper: defaultPolicy.version
  },
  {
    label: 'Quota remaining',
    value: 'BYOK',
    helper: 'No hosted provider credits'
  }
];
