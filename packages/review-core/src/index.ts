import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
  Finding,
  FindingSeverity,
  PolicyBundle,
  ReviewConventionMetadata,
  ReviewMode,
  ReviewOutputFormat,
  ReviewRequest,
  ReviewSession,
  ReviewSourceType
} from '@diffmint/contracts';
import { buildPolicyPrompt } from '@diffmint/policy-engine';
import { buildHeadlessReviewPrompt, buildReviewContextSummary } from './context';
import {
  getReviewConventionPath,
  inspectReviewConvention,
  resolveReviewConvention
} from './conventions';
import { renderMarkdownSession, renderTerminalSession } from './render';

export { renderMarkdownSession, renderTerminalSession } from './render';
export {
  getReviewConventionPath,
  inspectReviewConvention,
  resolveReviewConvention
} from './conventions';

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

export interface CreateReviewSessionRuntimeOptions {
  cwd?: string;
  policy?: PolicyBundle;
  provider?: string;
  model?: string;
}

export interface ReviewSessionSanitizationOptions {
  redactText?: boolean;
  omitRawProviderOutput?: boolean;
}

interface HeadlessRuntimeResult {
  findings: Finding[];
  summary: string;
  durationMs: number;
  rawOutput: string;
  artifactLabel: string;
}

interface ParsedDiffFile {
  firstLine?: number;
  addedLines: Array<{ line: number; text: string }>;
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

function isUntrackedFile(cwd: string, filePath: string): boolean {
  const status = tryRun('git', ['status', '--porcelain', '--', filePath], cwd);
  return status?.trim().startsWith('??') ?? false;
}

function escapeDiffPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function buildUntrackedFileDiff(cwd: string, filePath: string): string {
  const absolutePath = path.join(cwd, filePath);

  if (!existsSync(absolutePath)) {
    return '';
  }

  const normalizedPath = escapeDiffPath(filePath);
  const content = readFileSync(absolutePath, 'utf8');
  const contentLines = content.split('\n');
  const lines = content.endsWith('\n') ? contentLines.slice(0, -1) : contentLines;
  const diff = [
    `diff --git a/${normalizedPath} b/${normalizedPath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${normalizedPath}`
  ];

  if (lines.length > 0) {
    diff.push(`@@ -0,0 +1,${lines.length} @@`);
    diff.push(...lines.map((line) => `+${line}`));
  }

  return diff.join('\n');
}

export function createTraceId(): string {
  return randomUUID();
}

export function collectGitDiff(options: BuildReviewRequestOptions): string {
  const diff = tryRun('git', buildGitDiffArgs(options), options.cwd) ?? '';
  const files = options.files ?? [];

  if (files.length === 0) {
    return diff;
  }

  const changedFiles = new Set(detectChangedFiles(diff));
  const syntheticDiffs = files
    .filter((file) => !changedFiles.has(file) && isUntrackedFile(options.cwd, file))
    .map((file) => buildUntrackedFileDiff(options.cwd, file))
    .filter(Boolean);

  if (syntheticDiffs.length === 0) {
    return diff;
  }

  return [diff, ...syntheticDiffs].filter(Boolean).join('\n');
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

function normalizeReviewFilePath(cwd: string, filePath: string): string {
  const normalizedPath = filePath.replace(/\\/g, '/');

  if (!path.isAbsolute(normalizedPath)) {
    return normalizedPath.replace(/^\.\//, '');
  }

  const relativePath = path.relative(cwd, normalizedPath).replace(/\\/g, '/');
  return relativePath.startsWith('..') ? normalizedPath : relativePath.replace(/^\.\//, '');
}

function normalizeReviewFiles(cwd: string, files?: string[]): string[] {
  if (!files || files.length === 0) {
    return [];
  }

  return [...new Set(files.map((file) => normalizeReviewFilePath(cwd, file)))];
}

function parseDiffFiles(diff: string): Map<string, ParsedDiffFile> {
  const parsed = new Map<string, ParsedDiffFile>();
  let currentFile: string | null = null;
  let currentLine = 0;
  let inHunk = false;

  for (const line of diff.split('\n')) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);

    if (diffMatch) {
      currentFile = diffMatch[2];
      parsed.set(currentFile, {
        addedLines: []
      });
      inHunk = false;
      continue;
    }

    if (!currentFile) {
      continue;
    }

    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = Number(hunkMatch[1] ?? '0');
      inHunk = true;
      const fileState = parsed.get(currentFile);

      if (fileState && fileState.firstLine === undefined) {
        fileState.firstLine = currentLine;
      }
      continue;
    }

    if (!inHunk || line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }

    if (line.startsWith('+')) {
      parsed.get(currentFile)?.addedLines.push({
        line: currentLine,
        text: line.slice(1)
      });
      currentLine += 1;
      continue;
    }

    if (line.startsWith('-')) {
      continue;
    }

    if (line.startsWith(' ')) {
      currentLine += 1;
    }
  }

  return parsed;
}

function resolveFindingLine(fileDiff: ParsedDiffFile | undefined): number | undefined {
  return fileDiff?.addedLines[0]?.line ?? fileDiff?.firstLine;
}

function buildExcerptFromFile(
  cwd: string,
  filePath: string,
  line: number | undefined,
  convention: ReviewConventionMetadata | undefined
): string | undefined {
  if (!line) {
    return undefined;
  }

  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  const contextLines = convention?.snippetContextLines ?? 2;
  const fileLines = readFileSync(absolutePath, 'utf8').split('\n');
  const start = Math.max(line - contextLines - 1, 0);
  const end = Math.min(line + contextLines, fileLines.length);
  return fileLines.slice(start, end).join('\n').trimEnd() || undefined;
}

function buildExcerptFromDiff(fileDiff: ParsedDiffFile | undefined): string | undefined {
  if (!fileDiff || fileDiff.addedLines.length === 0) {
    return undefined;
  }

  return fileDiff.addedLines
    .slice(0, 5)
    .map((entry) => entry.text)
    .join('\n')
    .trimEnd();
}

function enrichFindingLocation(
  finding: Finding,
  request: ReviewRequest,
  diffFiles: Map<string, ParsedDiffFile>
): Finding {
  if (!finding.filePath) {
    return finding;
  }

  const normalizedFilePath = normalizeReviewFilePath(request.metadata.cwd, finding.filePath);
  const fileDiff = diffFiles.get(normalizedFilePath);
  const line = finding.line ?? resolveFindingLine(fileDiff);
  const excerpt =
    finding.excerpt ??
    buildExcerptFromFile(
      request.metadata.cwd,
      normalizedFilePath,
      line,
      request.metadata.convention
    ) ??
    buildExcerptFromDiff(fileDiff);

  return {
    ...finding,
    filePath: normalizedFilePath,
    line,
    endLine: finding.endLine ?? line,
    excerpt
  };
}

function countSeverity(findings: Finding[], severity: FindingSeverity): number {
  return findings.filter((item) => item.severity === severity).length;
}

function redactSensitiveText(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    return value;
  }

  return value
    .replace(
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g,
      '[REDACTED PRIVATE KEY]'
    )
    .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|pk|rk)_[A-Za-z0-9_-]{16,}\b/g, '[REDACTED API KEY]')
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED API KEY]')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED GITHUB TOKEN]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED GITHUB TOKEN]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED AWS ACCESS KEY]')
    .replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED GOOGLE API KEY]')
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, '[REDACTED SLACK TOKEN]')
    .replace(
      /((?:token|secret|password|passphrase|api[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*)(['"]?)([^'"\s]+)\2/gi,
      (_match: string, prefix: string, quote: string) => `${prefix}${quote}[REDACTED]${quote}`
    );
}

function sanitizeArtifactForCloudSync(
  artifact: ReviewSession['artifacts'][number],
  options: Required<ReviewSessionSanitizationOptions>
): ReviewSession['artifacts'][number] {
  if (options.omitRawProviderOutput && artifact.kind === 'raw-provider-output') {
    return {
      ...artifact,
      mimeType: 'text/plain',
      content: '[REDACTED raw provider output omitted from cloud sync]',
      storageKey: undefined
    };
  }

  return {
    ...artifact,
    content: options.redactText ? redactSensitiveText(artifact.content) : artifact.content,
    storageKey: options.redactText ? redactSensitiveText(artifact.storageKey) : artifact.storageKey
  };
}

function createFinding(options: {
  severity: FindingSeverity;
  title: string;
  summary: string;
  filePath?: string;
  line?: number;
  endLine?: number;
  excerpt?: string;
  suggestedAction?: string;
}): Finding {
  return {
    id: randomUUID(),
    severity: options.severity,
    title: options.title,
    summary: options.summary,
    filePath: options.filePath,
    line: options.line,
    endLine: options.endLine,
    excerpt: options.excerpt,
    suggestedAction: options.suggestedAction
  };
}

export function buildReviewRequest(options: BuildReviewRequestOptions): ReviewRequest {
  const convention = resolveReviewConvention(options.cwd);
  const normalizedFiles = normalizeReviewFiles(options.cwd, options.files);
  const diff = collectGitDiff({
    ...options,
    files: normalizedFiles
  });
  const files = normalizedFiles.length > 0 ? normalizedFiles : detectChangedFiles(diff);
  const promptProfile = convention.promptProfile;
  const baseRequest = {
    id: randomUUID(),
    traceId: createTraceId(),
    source: options.source,
    commandSource: 'cli',
    mode: options.mode ?? 'full',
    outputFormat: options.outputFormat ?? 'terminal',
    baseRef: options.baseRef,
    files,
    diff,
    promptProfile,
    policyVersionId: options.policy?.policyVersionId,
    localOnly: options.localOnly ?? false,
    cloudSyncEnabled: options.cloudSyncEnabled ?? true,
    metadata: {
      cwd: options.cwd,
      gitBranch: getCurrentBranch(options.cwd),
      provider: options.provider,
      model: options.model,
      convention
    },
    createdAt: new Date().toISOString()
  } satisfies ReviewRequest;

  return {
    ...baseRequest,
    metadata: {
      ...baseRequest.metadata,
      context: buildReviewContextSummary(baseRequest, {
        maxVisibleFiles: convention.maxVisibleFiles,
        maxFileGroups: convention.maxFileGroups
      })
    }
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

function findBinary(cwd: string, candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (tryRun(candidate, ['--version'], cwd)) {
      return candidate;
    }
  }

  return null;
}

function findQwenBinary(cwd: string): string | null {
  return findBinary(cwd, ['qwen', 'qwen-code', 'qwen-code-cli']);
}

function findCodexBinary(cwd: string): string | null {
  return findBinary(cwd, ['codex']);
}

function findAntigravityBinary(cwd: string): string | null {
  return findBinary(cwd, ['antigravity']);
}

function detectLocalApiKeySource(): string | null {
  const candidates = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'QWEN_API_KEY', 'DASHSCOPE_API_KEY'];

  for (const candidate of candidates) {
    if (process.env[candidate]?.trim()) {
      return candidate;
    }
  }

  return null;
}

function hasCodexAuthConfig(cwd: string): boolean {
  const loginStatus = tryRun('codex', ['login', 'status'], cwd);
  return Boolean(loginStatus && loginStatus.toLowerCase().startsWith('logged in'));
}

function hasHeadlessAuthConfig(): boolean {
  return Boolean(detectLocalApiKeySource());
}

function shouldUseCodexRuntime(cwd: string, provider?: string): boolean {
  const forcedMode = process.env.DIFFMINT_REVIEW_RUNTIME;

  if (forcedMode === 'scaffold' || forcedMode === 'qwen') {
    return false;
  }

  if (forcedMode === 'codex') {
    return Boolean(findCodexBinary(cwd) && hasCodexAuthConfig(cwd));
  }

  return provider === 'codex' && Boolean(findCodexBinary(cwd) && hasCodexAuthConfig(cwd));
}

function shouldUseQwenRuntime(cwd: string, provider?: string): boolean {
  const forcedMode = process.env.DIFFMINT_REVIEW_RUNTIME;

  if (forcedMode === 'scaffold') {
    return false;
  }

  if (forcedMode === 'codex') {
    return false;
  }

  if (forcedMode === 'qwen') {
    return Boolean(findQwenBinary(cwd));
  }

  return Boolean(provider?.startsWith('qwen') && findQwenBinary(cwd) && hasHeadlessAuthConfig());
}

function extractAssistantTextFromQwenPayload(payload: unknown): string | null {
  if (!Array.isArray(payload)) {
    return null;
  }

  for (let index = payload.length - 1; index >= 0; index -= 1) {
    const item = payload[index];

    if (
      item &&
      typeof item === 'object' &&
      'type' in item &&
      (item as { type?: string }).type === 'result' &&
      typeof (item as { result?: unknown }).result === 'string'
    ) {
      return (item as { result: string }).result;
    }

    if (
      item &&
      typeof item === 'object' &&
      'type' in item &&
      (item as { type?: string }).type === 'assistant'
    ) {
      const message = (item as { message?: { content?: Array<{ type?: string; text?: string }> } })
        .message;
      const textParts =
        message?.content
          ?.filter(
            (contentPart) => contentPart.type === 'text' && typeof contentPart.text === 'string'
          )
          .map((contentPart) => contentPart.text as string) ?? [];

      if (textParts.length > 0) {
        return textParts.join('\n');
      }
    }
  }

  return null;
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  const directStart = trimmed.indexOf('{');
  const directEnd = trimmed.lastIndexOf('}');

  if (directStart !== -1 && directEnd !== -1 && directEnd > directStart) {
    return trimmed.slice(directStart, directEnd + 1);
  }

  return null;
}

function normalizeFindingFromQwen(value: unknown): Finding | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const severity = candidate.severity;
  const title = candidate.title;
  const summary = candidate.summary;

  if (
    severity !== 'low' &&
    severity !== 'medium' &&
    severity !== 'high' &&
    severity !== 'critical'
  ) {
    return null;
  }

  if (typeof title !== 'string' || typeof summary !== 'string') {
    return null;
  }

  return {
    id: randomUUID(),
    severity,
    title,
    summary,
    filePath: typeof candidate.filePath === 'string' ? candidate.filePath : undefined,
    line: typeof candidate.line === 'number' ? candidate.line : undefined,
    endLine: typeof candidate.endLine === 'number' ? candidate.endLine : undefined,
    excerpt: typeof candidate.excerpt === 'string' ? candidate.excerpt : undefined,
    suggestedAction:
      typeof candidate.suggestedAction === 'string' ? candidate.suggestedAction : undefined
  };
}

function parseStructuredReviewText(
  rawText: string,
  rawOutput: string,
  options: {
    emptySummary: string;
    nonJsonSummaryPrefix: string;
    artifactLabel: string;
  }
): HeadlessRuntimeResult | null {
  const embeddedJson = extractJsonObject(rawText);

  if (!embeddedJson) {
    const summary = rawText.trim();

    if (!summary) {
      return null;
    }

    return {
      findings: [],
      summary: `${options.nonJsonSummaryPrefix} ${summary}`.trim(),
      durationMs: 1000,
      rawOutput,
      artifactLabel: options.artifactLabel
    };
  }

  const reviewPayload = JSON.parse(embeddedJson) as {
    summary?: unknown;
    findings?: unknown[];
  };
  const findings =
    reviewPayload.findings
      ?.map((finding) => normalizeFindingFromQwen(finding))
      .filter((finding): finding is Finding => Boolean(finding)) ?? [];
  const summary =
    typeof reviewPayload.summary === 'string' && reviewPayload.summary.trim().length > 0
      ? reviewPayload.summary.trim()
      : findings.length === 0
        ? options.emptySummary
        : `${options.nonJsonSummaryPrefix} ${findings.length} structured findings.`.trim();

  return {
    findings,
    summary,
    durationMs: 1000,
    rawOutput,
    artifactLabel: options.artifactLabel
  };
}

function parseQwenHeadlessOutput(rawOutput: string): HeadlessRuntimeResult | null {
  try {
    const payload = JSON.parse(rawOutput) as unknown;
    const assistantText = extractAssistantTextFromQwenPayload(payload);

    if (!assistantText) {
      return null;
    }

    return parseStructuredReviewText(assistantText, rawOutput, {
      emptySummary: 'Qwen completed the headless review with no structured findings.',
      nonJsonSummaryPrefix: 'Qwen completed the headless review with',
      artifactLabel: 'Qwen Headless Output'
    });
  } catch {
    return null;
  }
}

function parseCodexHeadlessOutput(rawOutput: string): HeadlessRuntimeResult | null {
  return parseStructuredReviewText(rawOutput, rawOutput, {
    emptySummary: 'Codex completed the headless review with no structured findings.',
    nonJsonSummaryPrefix: 'Codex completed the headless review with',
    artifactLabel: 'Codex Exec Output'
  });
}

function runQwenHeadlessReview(
  request: ReviewRequest,
  options: CreateReviewSessionRuntimeOptions
): HeadlessRuntimeResult | null {
  const cwd = options.cwd ?? request.metadata.cwd;
  const qwenBinary = findQwenBinary(cwd);

  if (!qwenBinary) {
    return null;
  }

  const startedAt = Date.now();

  try {
    const output = execFileSync(
      qwenBinary,
      [
        '--prompt',
        buildHeadlessReviewPrompt(request, options.policy),
        '--output-format',
        'json',
        '--model',
        options.model ?? request.metadata.model ?? 'qwen-code'
      ],
      {
        cwd,
        encoding: 'utf8',
        input: request.diff,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    const parsed = parseQwenHeadlessOutput(output);

    if (!parsed) {
      return null;
    }

    return {
      ...parsed,
      durationMs: Math.max(Date.now() - startedAt, 1)
    };
  } catch {
    return null;
  }
}

function runCodexHeadlessReview(
  request: ReviewRequest,
  options: CreateReviewSessionRuntimeOptions
): HeadlessRuntimeResult | null {
  const cwd = options.cwd ?? request.metadata.cwd;
  const codexBinary = findCodexBinary(cwd);

  if (!codexBinary || !hasCodexAuthConfig(cwd)) {
    return null;
  }

  const outputDir = mkdtempSync(path.join(tmpdir(), 'diffmint-codex-'));
  const lastMessagePath = path.join(outputDir, 'last-message.txt');
  const startedAt = Date.now();

  try {
    execFileSync(
      codexBinary,
      [
        'exec',
        '--skip-git-repo-check',
        '--color',
        'never',
        '--output-last-message',
        lastMessagePath,
        ...((options.model ?? request.metadata.model)
          ? ['--model', options.model ?? request.metadata.model ?? 'gpt-5-codex']
          : []),
        '-'
      ],
      {
        cwd,
        encoding: 'utf8',
        input: buildHeadlessReviewPrompt(request, options.policy),
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    if (!existsSync(lastMessagePath)) {
      return null;
    }

    const parsed = parseCodexHeadlessOutput(readFileSync(lastMessagePath, 'utf8'));

    if (!parsed) {
      return null;
    }

    return {
      ...parsed,
      durationMs: Math.max(Date.now() - startedAt, 1)
    };
  } catch {
    return null;
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

export function createFindingsFromRequest(request: ReviewRequest): Finding[] {
  const findings: Finding[] = [];
  const diffFiles = parseDiffFiles(request.diff);
  const primaryFile = request.files[0];
  const primaryLine = primaryFile ? resolveFindingLine(diffFiles.get(primaryFile)) : undefined;
  const primaryExcerpt =
    primaryFile && primaryLine
      ? buildExcerptFromFile(
          request.metadata.cwd,
          primaryFile,
          primaryLine,
          request.metadata.convention
        )
      : undefined;

  if (!request.diff.trim()) {
    findings.push(
      createFinding({
        severity: 'low',
        title: 'No local changes detected',
        summary:
          'The requested review scope did not produce a git diff. Confirm the target files, base ref, or staged state before rerunning.'
      })
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
        createFinding({
          severity: 'high',
          title: 'Sensitive control-plane surface changed',
          summary: `Changes in ${file} affect auth, billing, or API behavior. Run a security-oriented pass and capture verification steps before merge.`,
          filePath: file,
          suggestedAction:
            'Rerun with `dm review --base origin/main --mode security` and document the verification plan.'
        })
      );
    }

    if (file.includes('policy') || file.includes('docs')) {
      findings.push(
        createFinding({
          severity: 'medium',
          title: 'Governance content changed',
          summary: `Updates in ${file} should stay aligned with the active workspace policy version and release notes.`,
          filePath: file,
          suggestedAction:
            'Confirm the policy version, changelog entry, and related docs links are updated together.'
        })
      );
    }
  }

  const hasTests = files.some((file) => file.includes('test') || file.includes('__tests__'));
  if (!hasTests) {
    findings.push(
      createFinding({
        severity: 'medium',
        title: 'No test changes found',
        summary:
          'The diff does not appear to include automated test coverage. Confirm whether the change is low-risk or document manual verification.',
        filePath: primaryFile,
        line: primaryLine,
        endLine: primaryLine,
        excerpt: primaryExcerpt
      })
    );
  }

  return findings.map((finding) => enrichFindingLocation(finding, request, diffFiles));
}

export function createReviewSession(request: ReviewRequest): ReviewSession {
  const findings = createFindingsFromRequest(request);
  const startedAt = new Date().toISOString();
  const completedAt = new Date().toISOString();
  const context = request.metadata.context ?? buildReviewContextSummary(request);

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
    context,
    convention: request.metadata.convention,
    summary:
      findings.length === 0
        ? 'No obvious issues detected in the selected review scope.'
        : `Generated ${findings.length} review findings for ${context.fileSummary.toLowerCase()}.`,
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

export async function createReviewSessionWithRuntime(
  request: ReviewRequest,
  options: CreateReviewSessionRuntimeOptions = {}
): Promise<ReviewSession> {
  const cwd = options.cwd ?? request.metadata.cwd;
  const requestedProvider = options.provider ?? request.metadata.provider;

  if (shouldUseCodexRuntime(cwd, requestedProvider)) {
    const runtimeResult = runCodexHeadlessReview(request, options);

    if (runtimeResult) {
      const diffFiles = parseDiffFiles(request.diff);
      const findings = runtimeResult.findings.map((finding) =>
        enrichFindingLocation(finding, request, diffFiles)
      );
      const startedAt = new Date().toISOString();
      const completedAt = new Date().toISOString();
      const context = request.metadata.context ?? buildReviewContextSummary(request);

      return {
        id: randomUUID(),
        traceId: request.traceId,
        requestId: request.id,
        source: request.source,
        commandSource: request.commandSource,
        provider: requestedProvider ?? 'codex',
        model: options.model ?? request.metadata.model ?? 'gpt-5-codex',
        policyVersionId: request.policyVersionId,
        status: 'completed',
        findings,
        context,
        convention: request.metadata.convention,
        summary: runtimeResult.summary,
        severityCounts: {
          low: countSeverity(findings, 'low'),
          medium: countSeverity(findings, 'medium'),
          high: countSeverity(findings, 'high'),
          critical: countSeverity(findings, 'critical')
        },
        durationMs: runtimeResult.durationMs,
        startedAt,
        completedAt,
        artifacts: [
          {
            id: randomUUID(),
            kind: 'terminal',
            label: 'Terminal Summary',
            mimeType: 'text/plain',
            content: renderTerminalSession(request, findings)
          },
          {
            id: randomUUID(),
            kind: 'raw-provider-output',
            label: runtimeResult.artifactLabel,
            mimeType: 'application/json',
            content: runtimeResult.rawOutput
          }
        ]
      };
    }
  }

  if (!shouldUseQwenRuntime(cwd, requestedProvider)) {
    return createReviewSession(request);
  }

  const runtimeResult = runQwenHeadlessReview(request, options);

  if (!runtimeResult) {
    return createReviewSession(request);
  }

  const diffFiles = parseDiffFiles(request.diff);
  const findings = runtimeResult.findings.map((finding) =>
    enrichFindingLocation(finding, request, diffFiles)
  );
  const startedAt = new Date().toISOString();
  const completedAt = new Date().toISOString();
  const context = request.metadata.context ?? buildReviewContextSummary(request);

  return {
    id: randomUUID(),
    traceId: request.traceId,
    requestId: request.id,
    source: request.source,
    commandSource: request.commandSource,
    provider: options.provider ?? request.metadata.provider ?? 'qwen',
    model: options.model ?? request.metadata.model ?? 'qwen-code',
    policyVersionId: request.policyVersionId,
    status: 'completed',
    findings,
    context,
    convention: request.metadata.convention,
    summary: runtimeResult.summary,
    severityCounts: {
      low: countSeverity(findings, 'low'),
      medium: countSeverity(findings, 'medium'),
      high: countSeverity(findings, 'high'),
      critical: countSeverity(findings, 'critical')
    },
    durationMs: runtimeResult.durationMs,
    startedAt,
    completedAt,
    artifacts: [
      {
        id: randomUUID(),
        kind: 'terminal',
        label: 'Terminal Summary',
        mimeType: 'text/plain',
        content: renderTerminalSession(request, findings)
      },
      {
        id: randomUUID(),
        kind: 'raw-provider-output',
        label: runtimeResult.artifactLabel,
        mimeType: 'application/json',
        content: runtimeResult.rawOutput
      }
    ]
  };
}

export function sanitizeReviewSessionForCloudSync(
  session: ReviewSession,
  options: ReviewSessionSanitizationOptions = {}
): ReviewSession {
  const normalizedOptions: Required<ReviewSessionSanitizationOptions> = {
    redactText: options.redactText ?? true,
    omitRawProviderOutput: options.omitRawProviderOutput ?? true
  };

  return {
    ...session,
    summary: normalizedOptions.redactText
      ? (redactSensitiveText(session.summary) ?? session.summary)
      : session.summary,
    findings: session.findings.map((finding) => ({
      ...finding,
      title: normalizedOptions.redactText
        ? (redactSensitiveText(finding.title) ?? finding.title)
        : finding.title,
      summary: normalizedOptions.redactText
        ? (redactSensitiveText(finding.summary) ?? finding.summary)
        : finding.summary,
      excerpt: normalizedOptions.redactText
        ? redactSensitiveText(finding.excerpt)
        : finding.excerpt,
      suggestedAction: normalizedOptions.redactText
        ? redactSensitiveText(finding.suggestedAction)
        : finding.suggestedAction
    })),
    artifacts: session.artifacts.map((artifact) =>
      sanitizeArtifactForCloudSync(artifact, normalizedOptions)
    )
  };
}

export function runDoctor(cwd: string): DoctorCheck[] {
  const gitVersion = tryRun('git', ['--version'], cwd);
  const codexVersion = tryRun('codex', ['--version'], cwd);
  const codexLoginStatus = codexVersion ? tryRun('codex', ['login', 'status'], cwd) : null;
  const antigravityVersion = tryRun('antigravity', ['--version'], cwd);
  const qwenVersion =
    tryRun('qwen', ['--version'], cwd) ??
    tryRun('qwen-code', ['--version'], cwd) ??
    tryRun('qwen-code-cli', ['--version'], cwd);
  const apiKeySource = detectLocalApiKeySource();

  return [
    {
      id: 'git',
      label: 'Git',
      status: gitVersion ? 'ok' : 'fail',
      detail: gitVersion ?? 'Git is not available in PATH.'
    },
    {
      id: 'codex',
      label: 'Codex',
      status:
        codexVersion && codexLoginStatus?.toLowerCase().startsWith('logged in') ? 'ok' : 'warn',
      detail: codexVersion
        ? `${codexVersion}${codexLoginStatus ? ` · ${codexLoginStatus}` : ' · run `codex login`'}`
        : 'Codex CLI was not detected. Install Codex or keep Diffmint in scaffold mode.'
    },
    {
      id: 'antigravity',
      label: 'Antigravity',
      status: antigravityVersion ? 'ok' : 'warn',
      detail: antigravityVersion
        ? `${antigravityVersion} · local desktop auth can stay on the user machine.`
        : 'Antigravity was not detected. Local desktop BYOK flow is unavailable.'
    },
    {
      id: 'qwen',
      label: 'Qwen Code',
      status: qwenVersion ? 'ok' : 'warn',
      detail: qwenVersion ?? 'Qwen Code was not detected. Review runs will stay in scaffold mode.'
    },
    {
      id: 'api-key',
      label: 'Local API key',
      status: apiKeySource ? 'ok' : 'warn',
      detail: apiKeySource
        ? `${apiKeySource} detected. Diffmint does not store provider keys on the server.`
        : 'No local API key detected. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, QWEN_API_KEY, or DASHSCOPE_API_KEY for BYOK API mode.'
    },
    {
      id: 'api',
      label: 'API base URL',
      status: process.env.DIFFMINT_API_BASE_URL ? 'ok' : 'warn',
      detail:
        process.env.DIFFMINT_API_BASE_URL ??
        'Set DIFFMINT_API_BASE_URL to connect CLI sync and device auth to the control plane.'
    }
  ];
}
