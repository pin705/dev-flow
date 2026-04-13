import type {
  Finding,
  ReviewContextSummary,
  ReviewRequest,
  ReviewSession
} from '@diffmint/contracts';
import {
  buildRecommendedNextSteps,
  buildReviewContextSummary,
  formatFileGroupSummary
} from './context';

function countSeverity(findings: Finding[], severity: Finding['severity']): number {
  return findings.filter((finding) => finding.severity === severity).length;
}

function renderSeveritySummary(findings: Finding[]): string {
  return [
    `Critical ${countSeverity(findings, 'critical')}`,
    `High ${countSeverity(findings, 'high')}`,
    `Medium ${countSeverity(findings, 'medium')}`,
    `Low ${countSeverity(findings, 'low')}`
  ].join(' | ');
}

function formatFindingLocation(finding: Finding): string | null {
  if (!finding.filePath) {
    return null;
  }

  if (finding.line && finding.endLine && finding.endLine !== finding.line) {
    return `${finding.filePath}:${finding.line}-${finding.endLine}`;
  }

  if (finding.line) {
    return `${finding.filePath}:${finding.line}`;
  }

  return finding.filePath;
}

function renderTerminalExcerpt(finding: Finding): string[] {
  if (!finding.excerpt) {
    return [];
  }

  return ['     Code:', ...finding.excerpt.split('\n').map((line) => `       ${line}`)];
}

function renderContextLines(context: ReviewContextSummary): string[] {
  const lines = [
    `  Files: ${context.fileSummary}`,
    `  File groups: ${formatFileGroupSummary(context.fileGroups)}`,
    `  Diff summary: ${context.diffStats.fileCount} file(s), +${context.diffStats.additions}/-${context.diffStats.deletions}`
  ];

  if (context.visibleFiles.length > 0) {
    const visible =
      context.remainingFileCount > 0
        ? `${context.visibleFiles.join(', ')} (+${context.remainingFileCount} more)`
        : context.visibleFiles.join(', ');

    lines.push(`  Visible files: ${visible}`);
  }

  return lines;
}

function renderFindingLines(findings: Finding[]): string[] {
  if (findings.length === 0) {
    return ['  No actionable findings detected.'];
  }

  return findings.flatMap((finding, index) => {
    const lines = [`  ${index + 1}. ${finding.severity.toUpperCase()} ${finding.title}`];
    const location = formatFindingLocation(finding);

    if (location) {
      lines.push(`     File: ${location}`);
    }

    lines.push(`     Why: ${finding.summary}`);
    lines.push(...renderTerminalExcerpt(finding));

    if (finding.suggestedAction) {
      lines.push(`     Next: ${finding.suggestedAction}`);
    }

    return lines;
  });
}

function renderNextSteps(context: ReviewContextSummary, findings: Finding[]): string[] {
  return buildRecommendedNextSteps(findings, context).map((step) => `  - ${step}`);
}

export function renderTerminalSession(request: ReviewRequest, findings: Finding[]): string {
  const context = request.metadata.context ?? buildReviewContextSummary(request);
  const lines = [
    'Diffmint Review',
    '===============',
    '',
    'Overview',
    `  Trace ID: ${request.traceId}`,
    `  Source: ${context.sourceLabel}`,
    `  Mode: ${context.modeLabel}`,
    `  Branch: ${context.branch ?? 'unknown'}`,
    `  Prompt profile: ${context.promptProfile ?? request.promptProfile ?? 'diffmint-codex-compact-v1'}`
  ];

  if (request.metadata.provider) {
    lines.push(`  Provider: ${request.metadata.provider}`);
  }

  if (request.metadata.model) {
    lines.push(`  Model: ${request.metadata.model}`);
  }

  lines.push(
    '',
    'Context',
    ...renderContextLines(context),
    '',
    'Severity Summary',
    `  ${renderSeveritySummary(findings)}`,
    '',
    'Findings',
    ...renderFindingLines(findings),
    '',
    'Next Steps',
    ...renderNextSteps(context, findings)
  );

  return lines.join('\n');
}

function renderMarkdownFinding(findings: Finding[]): string {
  if (findings.length === 0) {
    return '- No findings';
  }

  return findings
    .map((finding, index) => {
      const lines = [`${index + 1}. **${finding.severity.toUpperCase()}** ${finding.title}`];
      const location = formatFindingLocation(finding);

      if (location) {
        lines.push(`   - File: \`${location}\``);
      }

      lines.push(`   - Why: ${finding.summary}`);

      if (finding.excerpt) {
        lines.push('   - Code:');
        lines.push('```text');
        lines.push(finding.excerpt);
        lines.push('```');
      }

      if (finding.suggestedAction) {
        lines.push(`   - Next: ${finding.suggestedAction}`);
      }

      return lines.join('\n');
    })
    .join('\n');
}

function renderMarkdownContext(context?: ReviewContextSummary): string {
  if (!context) {
    return '- Context metadata unavailable.';
  }

  const lines = [
    `- Source: \`${context.sourceLabel}\``,
    `- Mode: \`${context.modeLabel}\``,
    `- Branch: \`${context.branch ?? 'unknown'}\``,
    `- Prompt profile: \`${context.promptProfile ?? 'diffmint-codex-compact-v1'}\``,
    `- Files: ${context.fileSummary}`,
    `- File groups: ${formatFileGroupSummary(context.fileGroups)}`,
    `- Diff summary: ${context.diffStats.fileCount} file(s), +${context.diffStats.additions}/-${context.diffStats.deletions}`
  ];

  if (context.visibleFiles.length > 0) {
    const visible =
      context.remainingFileCount > 0
        ? `${context.visibleFiles.join(', ')} (+${context.remainingFileCount} more)`
        : context.visibleFiles.join(', ');
    lines.push(`- Visible files: ${visible}`);
  }

  return lines.join('\n');
}

function renderMarkdownNextSteps(
  context: ReviewContextSummary | undefined,
  findings: Finding[]
): string {
  if (!context) {
    return '- Record the review result and any manual checks before merge.';
  }

  return buildRecommendedNextSteps(findings, context)
    .map((step) => `- ${step}`)
    .join('\n');
}

export function renderMarkdownSession(session: ReviewSession): string {
  return [
    '# Diffmint Review',
    '',
    '## Overview',
    `- Trace ID: \`${session.traceId}\``,
    `- Status: \`${session.status}\``,
    `- Provider: \`${session.provider}\``,
    `- Model: \`${session.model}\``,
    `- Summary: ${session.summary}`,
    '',
    '## Context',
    renderMarkdownContext(session.context),
    '',
    '## Severity Summary',
    `- Critical: ${session.severityCounts.critical}`,
    `- High: ${session.severityCounts.high}`,
    `- Medium: ${session.severityCounts.medium}`,
    `- Low: ${session.severityCounts.low}`,
    '',
    '## Findings',
    renderMarkdownFinding(session.findings),
    '',
    '## Next Steps',
    renderMarkdownNextSteps(session.context, session.findings),
    ''
  ].join('\n');
}
