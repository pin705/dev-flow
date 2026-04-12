export type ProductSurface = 'cli' | 'vscode' | 'web' | 'admin';

export type ReviewMode =
  | 'bug-risk'
  | 'security'
  | 'performance'
  | 'maintainability'
  | 'team-policy'
  | 'full'
  | 'custom';

export type ReviewSourceType =
  | 'local_diff'
  | 'selected_files'
  | 'branch_compare'
  | 'pull_request'
  | 'pasted_diff'
  | 'commit_range';

export type CommandSource = 'cli' | 'vscode' | 'web';
export type ReviewOutputFormat = 'terminal' | 'json' | 'markdown';
export type FindingSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ReviewSessionStatus = 'queued' | 'running' | 'completed' | 'failed';
export type ArtifactKind = 'markdown' | 'json' | 'terminal' | 'raw-provider-output' | 'diagnostic';
export type ReleaseChannelName = 'stable' | 'preview' | 'canary';

export interface WorkspaceRef {
  id: string;
  slug: string;
  name: string;
}

export interface ProviderConfigSummary {
  id: string;
  provider: 'qwen' | 'openai-compatible' | 'anthropic-compatible' | 'custom';
  mode: 'managed' | 'byok';
  defaultModel: string;
  allowedModels: string[];
  fallbackProvider?: string;
  rateLimitPerMinute?: number;
  encrypted: boolean;
  updatedAt: string;
}

export interface PolicyChecklistItem {
  id: string;
  title: string;
  guidance: string;
  required: boolean;
}

export interface PolicyRule {
  id: string;
  category: 'security' | 'testing' | 'quality' | 'api' | 'governance';
  title: string;
  description: string;
  guidance: string;
  severity: FindingSeverity;
  bannedPatterns?: string[];
}

export interface PolicyBundle {
  workspaceId: string;
  policySetId: string;
  policyVersionId: string;
  name: string;
  version: string;
  checksum: string;
  publishedAt: string;
  summary: string;
  checklist: PolicyChecklistItem[];
  rules: PolicyRule[];
}

export interface WorkspaceBootstrap {
  workspace: WorkspaceRef;
  role: 'owner' | 'admin' | 'member' | 'billing_admin' | 'auditor';
  policy: PolicyBundle;
  provider: ProviderConfigSummary;
  quotas: {
    includedCredits: number;
    remainingCredits: number;
    seats: number;
    seatLimit: number;
    spendCapUsd?: number;
  };
  syncDefaults: {
    cloudSyncEnabled: boolean;
    localOnlyDefault: boolean;
    redactionEnabled: boolean;
  };
  releaseChannels: ReleaseChannelName[];
}

export interface ReviewRequest {
  id: string;
  traceId: string;
  workspaceId?: string;
  source: ReviewSourceType;
  commandSource: CommandSource;
  mode: ReviewMode;
  outputFormat: ReviewOutputFormat;
  baseRef?: string;
  files: string[];
  diff: string;
  promptProfile?: string;
  policyVersionId?: string;
  localOnly: boolean;
  cloudSyncEnabled: boolean;
  metadata: {
    cwd: string;
    gitBranch?: string;
    provider?: string;
    model?: string;
  };
  createdAt: string;
}

export interface Finding {
  id: string;
  severity: FindingSeverity;
  title: string;
  summary: string;
  filePath?: string;
  line?: number;
  ruleId?: string;
  suggestedAction?: string;
}

export interface ReviewArtifact {
  id: string;
  kind: ArtifactKind;
  label: string;
  mimeType: string;
  content?: string;
  storageKey?: string;
}

export interface ReviewSession {
  id: string;
  traceId: string;
  workspaceId?: string;
  requestId: string;
  source: ReviewSourceType;
  commandSource: CommandSource;
  provider?: string;
  model?: string;
  policyVersionId?: string;
  status: ReviewSessionStatus;
  findings: Finding[];
  summary: string;
  severityCounts: Record<FindingSeverity, number>;
  durationMs: number;
  startedAt: string;
  completedAt?: string;
  artifacts: ReviewArtifact[];
}

export interface UsageEvent {
  id: string;
  workspaceId: string;
  actorId?: string;
  source: CommandSource;
  event: 'review.started' | 'review.completed' | 'review.failed' | 'auth.login' | 'sync.uploaded';
  creditsDelta?: number;
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

export interface DeviceAuthSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete?: string;
  expiresAt: string;
  intervalSeconds: number;
  status: 'pending' | 'approved' | 'expired' | 'revoked';
  workspaceId?: string;
}

export interface ReleaseManifest {
  channel: ReleaseChannelName;
  version: string;
  releasedAt: string;
  cli: {
    version: string;
    downloadUrl: string;
    checksum: string;
  };
  vscode: {
    version: string;
    marketplaceUrl: string;
    checksum: string;
  };
  notesUrl?: string;
}
