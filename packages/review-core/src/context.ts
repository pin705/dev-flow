import type {
  Finding,
  PolicyBundle,
  ReviewConventionMetadata,
  ReviewContextGroup,
  ReviewContextSummary,
  ReviewRequest,
  ReviewSourceType
} from '@diffmint/contracts';

const MAX_VISIBLE_FILES = 5;
const MAX_PROMPT_FILES = 8;
const MAX_FILE_GROUPS = 6;

export interface ReviewContextSummaryOptions {
  maxVisibleFiles?: number;
  maxFileGroups?: number;
}

function humanizeSource(source: ReviewSourceType): string {
  return source
    .split('_')
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');
}

function getFileGroupLabel(filePath: string): string {
  const segments = filePath.split('/').filter(Boolean);

  if (segments.length === 0) {
    return 'root';
  }

  if ((segments[0] === 'apps' || segments[0] === 'packages') && segments.length > 1) {
    return `${segments[0]}/${segments[1]}`;
  }

  return segments[0];
}

function sortFileGroups(groups: ReviewContextGroup[]): ReviewContextGroup[] {
  return [...groups].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }

    return left.label.localeCompare(right.label);
  });
}

function buildFileGroups(files: string[], maxFileGroups = MAX_FILE_GROUPS): ReviewContextGroup[] {
  const counts = new Map<string, number>();

  for (const file of files) {
    const label = getFileGroupLabel(file);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return sortFileGroups(
    [...counts.entries()].map(([label, count]) => ({
      label,
      count
    }))
  ).slice(0, maxFileGroups);
}

function buildDiffStats(diff: string, fileCount: number): ReviewContextSummary['diffStats'] {
  let additions = 0;
  let deletions = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }

    if (line.startsWith('+')) {
      additions += 1;
      continue;
    }

    if (line.startsWith('-')) {
      deletions += 1;
    }
  }

  return {
    fileCount,
    additions,
    deletions
  };
}

function buildFileSummary(files: string[], groups: ReviewContextGroup[]): string {
  if (files.length === 0) {
    return 'Auto-detected from diff.';
  }

  if (files.length === 1) {
    return files[0];
  }

  const groupSummary = groups.map((group) => `${group.label} (${group.count})`).join(', ');
  return `${files.length} files across ${groupSummary || 'the current diff'}.`;
}

function formatVisibleFiles(
  files: string[],
  maxVisible = MAX_VISIBLE_FILES
): {
  visibleFiles: string[];
  remainingFileCount: number;
} {
  if (files.length <= maxVisible) {
    return {
      visibleFiles: files,
      remainingFileCount: 0
    };
  }

  return {
    visibleFiles: files.slice(0, maxVisible),
    remainingFileCount: files.length - maxVisible
  };
}

function resolveContextLimits(
  convention: ReviewConventionMetadata | undefined,
  options: ReviewContextSummaryOptions
): { maxVisibleFiles: number; maxFileGroups: number } {
  return {
    maxVisibleFiles: options.maxVisibleFiles ?? convention?.maxVisibleFiles ?? MAX_VISIBLE_FILES,
    maxFileGroups: options.maxFileGroups ?? convention?.maxFileGroups ?? MAX_FILE_GROUPS
  };
}

export function buildReviewContextSummary(
  request: ReviewRequest,
  options: ReviewContextSummaryOptions = {}
): ReviewContextSummary {
  const limits = resolveContextLimits(request.metadata.convention, options);
  const fileGroups = buildFileGroups(request.files, limits.maxFileGroups);
  const { visibleFiles, remainingFileCount } = formatVisibleFiles(
    request.files,
    limits.maxVisibleFiles
  );

  return {
    sourceLabel: humanizeSource(request.source),
    modeLabel: request.mode,
    branch: request.metadata.gitBranch,
    promptProfile: request.promptProfile,
    fileSummary: buildFileSummary(request.files, fileGroups),
    visibleFiles,
    remainingFileCount,
    fileGroups,
    diffStats: buildDiffStats(request.diff, request.files.length)
  };
}

export function formatFileGroupSummary(groups: ReviewContextGroup[]): string {
  if (groups.length === 0) {
    return 'No file groups detected.';
  }

  return groups.map((group) => `${group.label} (${group.count})`).join(', ');
}

export function buildRecommendedNextSteps(
  findings: Finding[],
  context: ReviewContextSummary
): string[] {
  const nextSteps: string[] = [];
  const highestSeverity = findings.some(
    (finding) => finding.severity === 'critical' || finding.severity === 'high'
  );
  const mentionsTests = findings.some(
    (finding) =>
      finding.title.toLowerCase().includes('test') || finding.summary.toLowerCase().includes('test')
  );

  if (highestSeverity) {
    nextSteps.push('Run a security-oriented verification pass before merge.');
  }

  if (mentionsTests) {
    nextSteps.push('Add automated coverage or document manual verification for the changed scope.');
  }

  if (context.remainingFileCount > 0) {
    nextSteps.push('Open the full report or history view to inspect the remaining grouped files.');
  }

  if (nextSteps.length === 0 && findings.length > 0) {
    nextSteps.push('Capture the validation plan and resolve the highest-signal findings first.');
  }

  if (nextSteps.length === 0) {
    nextSteps.push('Record the review result and any manual checks before merge.');
  }

  return nextSteps;
}

function formatPromptVisibleFiles(context: ReviewContextSummary): string {
  if (context.visibleFiles.length === 0) {
    return 'Auto-detected from diff.';
  }

  const visible =
    context.visibleFiles.length > MAX_PROMPT_FILES
      ? context.visibleFiles.slice(0, MAX_PROMPT_FILES)
      : context.visibleFiles;

  const remaining =
    context.remainingFileCount + Math.max(context.visibleFiles.length - visible.length, 0);

  return remaining > 0 ? `${visible.join(', ')} (+${remaining} more)` : visible.join(', ');
}

export function buildHeadlessReviewPrompt(request: ReviewRequest, policy?: PolicyBundle): string {
  const context = request.metadata.context ?? buildReviewContextSummary(request);
  const convention = request.metadata.convention;
  const instructions = [
    'Role',
    'You are Diffmint, a policy-driven code review runtime.',
    '',
    'Priorities',
    '- Focus on concrete bugs, regressions, security issues, missing tests, and policy violations.',
    '- Collapse repetitive observations into a single higher-signal finding.',
    '- Ignore style-only nits unless they create real risk or confusion.',
    '',
    'Review Context',
    `- Prompt profile: ${request.promptProfile ?? 'diffmint-codex-compact-v1'}.`,
    `- Review mode: ${request.mode}.`,
    `- Review source: ${context.sourceLabel}.`,
    `- Branch: ${context.branch ?? 'unknown'}.`,
    `- Scope summary: ${context.fileSummary}`,
    `- File groups: ${formatFileGroupSummary(context.fileGroups)}.`,
    `- Visible files: ${formatPromptVisibleFiles(context)}.`,
    `- Diff summary: ${context.diffStats.fileCount} file(s), +${context.diffStats.additions}/-${context.diffStats.deletions}.`,
    '',
    'Policy Context'
  ];

  if (convention?.additionalPriorities.length) {
    instructions.push('', 'Team Priorities');
    instructions.push(...convention.additionalPriorities.map((item) => `- ${item}`));
  }

  if (convention?.reviewNotes.length) {
    instructions.push('', 'Review Notes');
    instructions.push(...convention.reviewNotes.map((item) => `- ${item}`));
  }

  if (policy) {
    instructions.push(`- Active policy version: ${policy.policyVersionId}.`);
    instructions.push(`- Policy summary: ${policy.summary}`);

    if (policy.checklist.length > 0) {
      instructions.push(
        `- Required checklist: ${policy.checklist
          .filter((item) => item.required)
          .slice(0, 4)
          .map((item) => item.title)
          .join(', ')}.`
      );
    }
  } else {
    instructions.push('- No policy bundle was provided.');
  }

  instructions.push(
    '',
    'Output Contract',
    '- Return valid JSON only.',
    '- Use this shape exactly:',
    '{"summary":"string","findings":[{"severity":"low|medium|high|critical","title":"string","summary":"string","filePath":"optional string","line":"optional number","excerpt":"optional string","suggestedAction":"optional string"}]}',
    '- Prefer 0-5 findings, ordered by risk.'
  );

  return instructions.join('\n');
}
