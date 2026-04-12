import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type {
  Finding,
  FindingSeverity,
  PolicyBundle,
  ReviewMode,
  ReviewOutputFormat,
  ReviewRequest,
  ReviewSession,
  ReviewSourceType
} from '@devflow/contracts';
import { buildPolicyPrompt } from '@devflow/policy-engine';

export interface BuildReviewRequestOptions {
  cwd: string;
  source: ReviewSourceType;
  outputFormat?: ReviewOutputFormat;
  mode?: ReviewMode;
  baseRef?: string;
  files?: string[];
  staged?: boolean;
  localOnly?: boolean;
  cloudSyncEnabled?: boolean;
  policy?: PolicyBundle;
  provider?: string;
  model?: string;
}

export interface DoctorCheck {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail';
  detail: string;
}

function run(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore']
  }).trim();
}

function tryRun(command: string, args: string[], cwd: string): string | null {
  try {
    return run(command, args, cwd);
  } catch {
    return null;
  }
}

function buildGitDiffArgs({
  baseRef,
  files,
  staged
}: Pick<BuildReviewRequestOptions, 'baseRef' | 'files' | 'staged'>): string[] {
  const args = ['diff'];

  if (staged) {
    args.push('--staged');
  }

  if (baseRef) {
    args.push(`${baseRef}...HEAD`);
  }

  args.push('--');

  if (files && files.length > 0) {
    args.push(...files);
  }

  return args;
}

export function createTraceId(): string {
  return randomUUID();
}

export function collectGitDiff(options: BuildReviewRequestOptions): string {
  const diff = tryRun('git', buildGitDiffArgs(options), options.cwd);
  return diff ?? '';
}

export function getCurrentBranch(cwd: string): string | undefined {
  return tryRun('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd) ?? undefined;
}

export function detectChangedFiles(diff: string): string[] {
  const fileMatches = diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm);
  const files = new Set<string>();

  for (const match of fileMatches) {
    files.add(match[2]);
  }

  return [...files];
}

function countSeverity(findings: Finding[], severity: FindingSeverity): number {
  return findings.filter((item) => item.severity === severity).length;
}

function createFinding(
  severity: FindingSeverity,
  title: string,
  summary: string,
  filePath?: string,
  suggestedAction?: string
): Finding {
  return {
    id: randomUUID(),
    severity,
    title,
    summary,
    filePath,
    suggestedAction
  };
}

export function buildReviewRequest(options: BuildReviewRequestOptions): ReviewRequest {
  const diff = collectGitDiff(options);
  const files =
    options.files && options.files.length > 0 ? options.files : detectChangedFiles(diff);

  return {
    id: randomUUID(),
    traceId: createTraceId(),
    source: options.source,
    commandSource: 'cli',
    mode: options.mode ?? 'full',
    outputFormat: options.outputFormat ?? 'terminal',
    baseRef: options.baseRef,
    files,
    diff,
    policyVersionId: options.policy?.policyVersionId,
    localOnly: options.localOnly ?? false,
    cloudSyncEnabled: options.cloudSyncEnabled ?? true,
    metadata: {
      cwd: options.cwd,
      gitBranch: getCurrentBranch(options.cwd),
      provider: options.provider,
      model: options.model
    },
    createdAt: new Date().toISOString()
  };
}

export function previewHeadlessCommand(request: ReviewRequest, policy?: PolicyBundle): string[] {
  const baseArgs = ['review', '--mode', request.mode];

  if (request.baseRef) {
    baseArgs.push('--base', request.baseRef);
  }

  if (request.files.length > 0) {
    baseArgs.push('--files', ...request.files);
  }

  if (policy) {
    baseArgs.push('--policy', buildPolicyPrompt(policy));
  }

  return baseArgs;
}

export function createFindingsFromRequest(request: ReviewRequest): Finding[] {
  const findings: Finding[] = [];

  if (!request.diff.trim()) {
    findings.push(
      createFinding(
        'low',
        'No local changes detected',
        'The requested review scope did not produce a git diff. Confirm the target files, base ref, or staged state before rerunning.'
      )
    );
    return findings;
  }

  const files = request.files;

  for (const file of files) {
    if (
      file.includes('/api/') ||
      file.endsWith('route.ts') ||
      file.includes('billing') ||
      file.includes('auth')
    ) {
      findings.push(
        createFinding(
          'high',
          'Sensitive control-plane surface changed',
          `Changes in ${file} affect auth, billing, or API behavior. Run a security-oriented pass and capture verification steps before merge.`,
          file,
          'Rerun with `devflow review --base origin/main --mode security` and document the verification plan.'
        )
      );
    }

    if (file.includes('policy') || file.includes('docs')) {
      findings.push(
        createFinding(
          'medium',
          'Governance content changed',
          `Updates in ${file} should stay aligned with the active workspace policy version and release notes.`,
          file,
          'Confirm the policy version, changelog entry, and related docs links are updated together.'
        )
      );
    }
  }

  const hasTests = files.some((file) => file.includes('test') || file.includes('__tests__'));
  if (!hasTests) {
    findings.push(
      createFinding(
        'medium',
        'No test changes found',
        'The diff does not appear to include automated test coverage. Confirm whether the change is low-risk or document manual verification.'
      )
    );
  }

  return findings;
}

export function createReviewSession(request: ReviewRequest): ReviewSession {
  const findings = createFindingsFromRequest(request);
  const startedAt = new Date().toISOString();
  const completedAt = new Date().toISOString();

  return {
    id: randomUUID(),
    traceId: request.traceId,
    requestId: request.id,
    source: request.source,
    commandSource: request.commandSource,
    provider: request.metadata.provider ?? 'qwen',
    model: request.metadata.model ?? 'qwen-code',
    policyVersionId: request.policyVersionId,
    status: 'completed',
    findings,
    summary:
      findings.length === 0
        ? 'No obvious issues detected in the selected review scope.'
        : `Generated ${findings.length} review findings for ${filesLabel(request.files)}.`,
    severityCounts: {
      low: countSeverity(findings, 'low'),
      medium: countSeverity(findings, 'medium'),
      high: countSeverity(findings, 'high'),
      critical: countSeverity(findings, 'critical')
    },
    durationMs: 250,
    startedAt,
    completedAt,
    artifacts: [
      {
        id: randomUUID(),
        kind: 'terminal',
        label: 'Terminal Summary',
        mimeType: 'text/plain',
        content: renderTerminalSession(request, findings)
      }
    ]
  };
}

function filesLabel(files: string[]): string {
  if (files.length === 0) {
    return 'the current diff';
  }

  if (files.length === 1) {
    return basename(files[0]);
  }

  return `${files.length} files`;
}

export function renderTerminalSession(request: ReviewRequest, findings: Finding[]): string {
  const lines = [
    `Devflow review`,
    `Trace ID: ${request.traceId}`,
    `Scope: ${request.source.replaceAll('_', ' ')}`,
    `Mode: ${request.mode}`,
    `Files: ${request.files.length > 0 ? request.files.join(', ') : '(auto-detected from diff)'}`,
    ''
  ];

  if (findings.length === 0) {
    lines.push('No actionable findings detected.');
  } else {
    lines.push('Findings:');
    for (const finding of findings) {
      lines.push(`- [${finding.severity}] ${finding.title}: ${finding.summary}`);
    }
  }

  return lines.join('\n');
}

export function renderMarkdownSession(session: ReviewSession): string {
  const findings = session.findings
    .map(
      (finding) => `- **${finding.severity.toUpperCase()}** ${finding.title}: ${finding.summary}`
    )
    .join('\n');

  return `# Devflow Review\n\n- Trace ID: \`${session.traceId}\`\n- Status: \`${session.status}\`\n- Provider: \`${session.provider}\`\n- Model: \`${session.model}\`\n\n## Findings\n${findings || '- No findings'}\n`;
}

export function runDoctor(cwd: string): DoctorCheck[] {
  const gitVersion = tryRun('git', ['--version'], cwd);
  const qwenVersion =
    tryRun('qwen', ['--version'], cwd) ??
    tryRun('qwen-code', ['--version'], cwd) ??
    tryRun('qwen-code-cli', ['--version'], cwd);

  return [
    {
      id: 'git',
      label: 'Git',
      status: gitVersion ? 'ok' : 'fail',
      detail: gitVersion ?? 'Git is not available in PATH.'
    },
    {
      id: 'qwen',
      label: 'Qwen Code',
      status: qwenVersion ? 'ok' : 'warn',
      detail: qwenVersion ?? 'Qwen Code was not detected. Review runs will stay in scaffold mode.'
    },
    {
      id: 'api',
      label: 'API base URL',
      status: process.env.DEVFLOW_API_BASE_URL ? 'ok' : 'warn',
      detail:
        process.env.DEVFLOW_API_BASE_URL ??
        'Set DEVFLOW_API_BASE_URL to connect CLI sync and device auth to the control plane.'
    }
  ];
}
