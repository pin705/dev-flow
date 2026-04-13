import path from 'node:path';
import type { ReviewSession } from '@diffmint/contracts';
import type { DoctorCheck } from '@diffmint/review-core';

function renderSection(title: string, lines: string[]): string[] {
  return [title, ...lines, ''];
}

function formatSeveritySummary(entry: ReviewSession): string {
  return [
    `Critical ${entry.severityCounts.critical}`,
    `High ${entry.severityCounts.high}`,
    `Medium ${entry.severityCounts.medium}`,
    `Low ${entry.severityCounts.low}`
  ].join(' | ');
}

function formatSourceLabel(value: string): string {
  return value.split('_').join(' ');
}

function formatFindingTitles(findings: ReviewSession['findings']): string {
  return findings.length === 0 ? 'None' : findings.map((finding) => finding.title).join(', ');
}

export function renderCliHelp(): string {
  return [
    'Diffmint CLI',
    '============',
    '',
    'Auth',
    '  dm auth login',
    '  dm auth logout',
    '',
    'Review',
    '  dm review',
    '  dm review --staged',
    '  dm review --base origin/main',
    '  dm review --files src/a.ts src/b.ts',
    '',
    'Analysis',
    '  dm explain <file>',
    '  dm tests <file>',
    '',
    'Diagnostics',
    '  dm history',
    '  dm history --json',
    '  dm history --provider qwen --query auth',
    '  dm history --compare latest previous',
    '  dm doctor',
    '  dm doctor --json',
    '',
    'Output Modes',
    '  dm review --json',
    '  dm review --markdown',
    '',
    'Examples',
    '  dm review --base origin/main --mode security',
    '  dm review --files apps/cli/src/index.ts --markdown',
    '  dm history --json',
    '  dm history --compare latest previous',
    '  dm doctor --json'
  ].join('\n');
}

export function renderDoctorChecks(checks: DoctorCheck[]): string {
  const lines = ['Diffmint Doctor', '===============', ''];

  for (const check of checks) {
    lines.push(`[${check.status.toUpperCase()}] ${check.label}`);
    lines.push(`  ${check.detail}`);
  }

  return lines.join('\n');
}

export function renderHistorySessions(entries: ReviewSession[]): string {
  if (entries.length === 0) {
    return [
      'Diffmint History',
      '===============',
      '',
      'No local or synced review sessions yet.'
    ].join('\n');
  }

  const lines = ['Diffmint History', '===============', ''];

  entries.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.summary}`);
    lines.push(`   Trace ID: ${entry.traceId}`);
    lines.push(`   Status: ${entry.status}`);
    lines.push(`   Source: ${formatSourceLabel(entry.source)} · ${entry.commandSource}`);
    lines.push(`   Severity: ${formatSeveritySummary(entry)}`);

    if (entry.context?.fileSummary) {
      lines.push(`   Scope: ${entry.context.fileSummary}`);
    }

    if (entry.completedAt) {
      lines.push(`   Completed: ${new Date(entry.completedAt).toLocaleString()}`);
    }

    lines.push('');
  });

  return lines.join('\n').trimEnd();
}

export function renderHistoryComparison(left: ReviewSession, right: ReviewSession): string {
  const leftTitles = new Set(left.findings.map((finding) => finding.title));
  const rightTitles = new Set(right.findings.map((finding) => finding.title));
  const leftOnly = left.findings.filter((finding) => !rightTitles.has(finding.title));
  const rightOnly = right.findings.filter((finding) => !leftTitles.has(finding.title));

  return [
    'Diffmint History Compare',
    '========================',
    '',
    'Session A',
    `  Trace ID: ${left.traceId}`,
    `  Summary: ${left.summary}`,
    `  Severity: ${formatSeveritySummary(left)}`,
    `  Scope: ${left.context?.fileSummary ?? 'No scope metadata'}`,
    `  Findings: ${formatFindingTitles(left.findings)}`,
    '',
    'Session B',
    `  Trace ID: ${right.traceId}`,
    `  Summary: ${right.summary}`,
    `  Severity: ${formatSeveritySummary(right)}`,
    `  Scope: ${right.context?.fileSummary ?? 'No scope metadata'}`,
    `  Findings: ${formatFindingTitles(right.findings)}`,
    '',
    'Finding Deltas',
    `  Only in A: ${formatFindingTitles(leftOnly)}`,
    `  Only in B: ${formatFindingTitles(rightOnly)}`,
    '',
    'Next Step',
    '  - Reopen the two trace IDs above and confirm whether the newer report improved the highest-risk findings.'
  ].join('\n');
}

export function renderExplainOutput(target: string, source: string): string {
  const exportLines = source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('export '))
    .slice(0, 4);
  const isClient = source.includes("'use client'") || source.includes('"use client"');
  const lineCount = source.split('\n').length;
  const nextCommand = `dm tests ${target}`;
  const signals = [
    `Path: ${target}`,
    `Lines: ${lineCount}`,
    `Runtime: ${isClient ? 'client component or browser-aware module' : 'server or shared module'}`,
    `Exports: ${exportLines.length > 0 ? exportLines.length : 0}`
  ];

  const sections = ['Diffmint Explain', '================', ''];

  sections.push(
    ...renderSection(
      'Overview',
      signals.map((line) => `  ${line}`)
    )
  );

  if (exportLines.length > 0) {
    sections.push(
      ...renderSection(
        'Code Signals',
        exportLines.map((line) => `  ${line}`)
      )
    );
  }

  sections.push(
    ...renderSection('Next Steps', [
      `  - Run \`${nextCommand}\` if this file changes behavior or contracts.`,
      `  - Open ${path.basename(target)} in the editor and compare the exported surface against the diff.`
    ])
  );

  return sections.join('\n').trimEnd();
}

export function renderSuggestedTests(target: string): string {
  const name = path.basename(target);

  return [
    'Diffmint Tests',
    '==============',
    '',
    'Coverage Plan',
    `  Target: ${name}`,
    '  1. Cover the primary happy path.',
    '  2. Validate error handling and empty-state behavior.',
    '  3. Verify policy or auth boundaries when control-plane logic is involved.',
    '  4. Confirm trace IDs or sync metadata are preserved when applicable.',
    '',
    'Suggested Next Step',
    `  - Add or update a test file adjacent to ${name} before merge.`
  ].join('\n');
}
