import type { PolicyBundle, ProviderConfigSummary, ReviewSession } from '@devflow/contracts';
import { createDefaultPolicyBundle } from '@devflow/policy-engine';

const workspaceId = 'ws_devflow_core';

export const providerSummaries: ProviderConfigSummary[] = [
  {
    id: 'provider-managed-qwen',
    provider: 'qwen',
    mode: 'managed',
    defaultModel: 'qwen-code',
    allowedModels: ['qwen-code', 'qwen-max'],
    fallbackProvider: 'openai-compatible',
    rateLimitPerMinute: 60,
    encrypted: true,
    updatedAt: '2026-04-12T08:30:00.000Z'
  },
  {
    id: 'provider-byok-lab',
    provider: 'openai-compatible',
    mode: 'byok',
    defaultModel: 'gpt-5.4-mini',
    allowedModels: ['gpt-5.4-mini', 'gpt-5.4'],
    fallbackProvider: 'qwen',
    rateLimitPerMinute: 30,
    encrypted: true,
    updatedAt: '2026-04-10T16:15:00.000Z'
  }
];

const defaultPolicy = createDefaultPolicyBundle(workspaceId);

export const policyBundles: PolicyBundle[] = [
  defaultPolicy,
  {
    ...defaultPolicy,
    policyVersionId: 'frontend-docs-v2',
    version: '2.0.0',
    checksum: 'frontend-docs-v2',
    name: 'Frontend and Docs Rules',
    summary: 'Extra guidance for docs integrity, changelog gating, and provider UX.',
    publishedAt: '2026-04-11T09:00:00.000Z'
  }
];

export const reviewSessions: ReviewSession[] = [
  {
    id: 'review-001',
    traceId: 'trace-devflow-001',
    requestId: 'request-001',
    workspaceId,
    source: 'branch_compare',
    commandSource: 'cli',
    provider: 'qwen',
    model: 'qwen-code',
    policyVersionId: defaultPolicy.policyVersionId,
    status: 'completed',
    summary: 'Docs and control-plane review completed with two medium findings.',
    severityCounts: { low: 0, medium: 2, high: 0, critical: 0 },
    findings: [],
    durationMs: 14300,
    startedAt: '2026-04-12T09:00:00.000Z',
    completedAt: '2026-04-12T09:00:14.300Z',
    artifacts: []
  },
  {
    id: 'review-002',
    traceId: 'trace-devflow-002',
    requestId: 'request-002',
    workspaceId,
    source: 'selected_files',
    commandSource: 'vscode',
    provider: 'qwen',
    model: 'qwen-code',
    policyVersionId: 'frontend-docs-v2',
    status: 'completed',
    summary: 'Selected files review flagged a missing verification note on provider settings.',
    severityCounts: { low: 1, medium: 1, high: 0, critical: 0 },
    findings: [],
    durationMs: 9800,
    startedAt: '2026-04-12T08:12:00.000Z',
    completedAt: '2026-04-12T08:12:09.800Z',
    artifacts: []
  },
  {
    id: 'review-003',
    traceId: 'trace-devflow-003',
    requestId: 'request-003',
    workspaceId,
    source: 'local_diff',
    commandSource: 'cli',
    provider: 'qwen',
    model: 'qwen-code',
    policyVersionId: defaultPolicy.policyVersionId,
    status: 'completed',
    summary: 'Local diff review caught an auth path update without explicit test coverage.',
    severityCounts: { low: 0, medium: 0, high: 1, critical: 0 },
    findings: [],
    durationMs: 12100,
    startedAt: '2026-04-11T14:32:00.000Z',
    completedAt: '2026-04-11T14:32:12.100Z',
    artifacts: []
  }
];

export const auditEvents = [
  {
    id: 'audit-001',
    event: 'policy.version_published',
    actor: 'Quynh Tran',
    target: 'Frontend and Docs Rules v2.0.0',
    when: '2026-04-11 09:00 UTC',
    detail: 'Published new guidance for docs links and changelog gating.'
  },
  {
    id: 'audit-002',
    event: 'provider.config_updated',
    actor: 'Bao Nguyen',
    target: 'Managed Qwen provider',
    when: '2026-04-10 16:15 UTC',
    detail: 'Added OpenAI-compatible fallback and lowered rate limit for BYOK traffic.'
  },
  {
    id: 'audit-003',
    event: 'review.synced',
    actor: 'Devflow CLI',
    target: 'trace-devflow-001',
    when: '2026-04-12 09:00 UTC',
    detail: 'Uploaded summary, severity counts, and markdown artifact.'
  }
];

export const overviewStats = [
  {
    label: 'Synced reviews',
    value: '148',
    helper: '+18 this week'
  },
  {
    label: 'Active seats',
    value: '26 / 30',
    helper: '4 seats remaining'
  },
  {
    label: 'Published policies',
    value: '2',
    helper: '1 version live'
  },
  {
    label: 'Quota remaining',
    value: '78%',
    helper: 'Managed provider credits'
  }
];
