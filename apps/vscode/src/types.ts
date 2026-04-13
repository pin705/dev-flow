export interface ReviewContextGroup {
  label: string;
  count: number;
}

export interface ReviewContextSummary {
  sourceLabel: string;
  modeLabel: string;
  branch?: string;
  promptProfile?: string;
  fileSummary: string;
  visibleFiles: string[];
  remainingFileCount: number;
  fileGroups: ReviewContextGroup[];
  diffStats: {
    fileCount: number;
    additions: number;
    deletions: number;
  };
}

export interface ReviewFinding {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  summary: string;
  filePath?: string;
  line?: number;
  endLine?: number;
  excerpt?: string;
  suggestedAction?: string;
}

export interface ReviewArtifact {
  id: string;
  kind: 'markdown' | 'json' | 'terminal' | 'raw-provider-output' | 'diagnostic';
  label: string;
  mimeType: string;
  content?: string;
  storageKey?: string;
}

export interface ReviewSessionView {
  id: string;
  traceId: string;
  requestId: string;
  source: string;
  commandSource: string;
  provider?: string;
  model?: string;
  policyVersionId?: string;
  status: string;
  findings: ReviewFinding[];
  context?: ReviewContextSummary;
  convention?: {
    promptProfile: string;
    source: 'default' | 'workspace-file';
    filePath?: string;
    additionalPriorities: string[];
    reviewNotes: string[];
    snippetContextLines: number;
    maxVisibleFiles: number;
    maxFileGroups: number;
  };
  summary: string;
  severityCounts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  durationMs: number;
  startedAt: string;
  completedAt?: string;
  artifacts: ReviewArtifact[];
}

export interface DoctorCheckView {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}
