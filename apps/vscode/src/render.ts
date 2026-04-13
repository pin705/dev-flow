import type { DiffmintHistoryEntry, DiffmintLocalConfig } from './diffmint';
import { escapeHtml } from './diffmint';
import type { DoctorCheckView, ReviewSessionView } from './types';

function renderBadge(label: string, tone: 'neutral' | 'ok' | 'warn' | 'fail' | 'critical'): string {
  const toneClass =
    tone === 'ok'
      ? 'background: rgba(34,197,94,.12); color: #166534;'
      : tone === 'warn'
        ? 'background: rgba(245,158,11,.14); color: #92400e;'
        : tone === 'fail' || tone === 'critical'
          ? 'background: rgba(239,68,68,.12); color: #991b1b;'
          : 'background: rgba(148,163,184,.14); color: #334155;';

  return `<span style="display:inline-flex;align-items:center;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:600;${toneClass}">${escapeHtml(label)}</span>`;
}

function renderSection(title: string, body: string): string {
  return `<section style="background: rgba(255,255,255,.78); border: 1px solid rgba(148,163,184,.18); border-radius: 18px; padding: 18px;">
    <h3 style="margin: 0 0 12px; font-size: 15px;">${escapeHtml(title)}</h3>
    ${body}
  </section>`;
}

function renderKeyValueRows(rows: Array<{ label: string; value: string }>): string {
  return `<div style="display:grid;gap:10px;">${rows
    .map(
      (row) => `<div style="display:grid;grid-template-columns:140px 1fr;gap:12px;">
        <div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">${escapeHtml(row.label)}</div>
        <div style="font-weight:500;word-break:break-word;">${escapeHtml(row.value)}</div>
      </div>`
    )
    .join('')}</div>`;
}

function renderCodeBlock(content: string): string {
  return `<pre style="margin:0; white-space:pre-wrap; overflow:auto; border-radius:14px; padding:16px; background:#0f172a; color:#e2e8f0; font-size:12px; line-height:1.6;"><code>${escapeHtml(
    content
  )}</code></pre>`;
}

function formatFindingLocation(finding: ReviewSessionView['findings'][number]): string | null {
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

function renderHtmlShell(title: string, subtitle: string, sections: string[]): string {
  return `<!doctype html>
<html>
  <body style="margin:0; background: linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%); color:#0f172a; font-family: Inter, ui-sans-serif, system-ui, sans-serif;">
    <main style="max-width: 1080px; margin: 0 auto; padding: 28px 24px 48px;">
      <header style="margin-bottom: 20px; padding: 24px; border-radius: 24px; background: radial-gradient(circle at top left, rgba(59,130,246,.14), transparent 30%), linear-gradient(135deg, rgba(15,23,42,.98), rgba(30,41,59,.94)); color: white;">
        <p style="margin:0 0 8px; font-size:12px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color: rgba(191,219,254,.92);">Diffmint</p>
        <h1 style="margin:0 0 10px; font-size:28px; line-height:1.15;">${escapeHtml(title)}</h1>
        <p style="margin:0; max-width:780px; color: rgba(226,232,240,.92); line-height:1.6;">${escapeHtml(subtitle)}</p>
      </header>
      <div style="display:grid; gap:16px;">${sections.join('')}</div>
    </main>
  </body>
</html>`;
}

function formatSeveritySummary(entry: {
  severityCounts?: { critical?: number; high?: number; medium?: number; low?: number };
}): string {
  const critical = entry.severityCounts?.critical ?? 0;
  const high = entry.severityCounts?.high ?? 0;
  const medium = entry.severityCounts?.medium ?? 0;
  const low = entry.severityCounts?.low ?? 0;

  return `Critical ${critical} | High ${high} | Medium ${medium} | Low ${low}`;
}

function formatSourceLabel(value?: string): string {
  return value ? value.split('_').join(' ') : '';
}

function renderReviewContext(session: ReviewSessionView): string {
  if (!session.context) {
    return '<p style="margin:0;color:#475569;">Context metadata is unavailable for this review.</p>';
  }

  const context = session.context;
  const visible =
    context.visibleFiles.length === 0
      ? 'Auto-detected from diff'
      : context.remainingFileCount > 0
        ? `${context.visibleFiles.join(', ')} (+${context.remainingFileCount} more)`
        : context.visibleFiles.join(', ');

  return renderKeyValueRows([
    { label: 'Source', value: context.sourceLabel },
    { label: 'Mode', value: context.modeLabel },
    { label: 'Branch', value: context.branch ?? 'unknown' },
    { label: 'Prompt', value: context.promptProfile ?? 'diffmint-codex-compact-v1' },
    { label: 'Scope', value: context.fileSummary },
    {
      label: 'Diff',
      value: `${context.diffStats.fileCount} file(s), +${context.diffStats.additions}/-${context.diffStats.deletions}`
    },
    {
      label: 'Groups',
      value:
        context.fileGroups.length > 0
          ? context.fileGroups.map((group) => `${group.label} (${group.count})`).join(', ')
          : 'No groups'
    },
    { label: 'Visible', value: visible }
  ]);
}

export function renderReviewSessionHtml(session: ReviewSessionView): string {
  const summaryBadges = [
    renderBadge(session.status.toUpperCase(), session.status === 'completed' ? 'ok' : 'neutral'),
    renderBadge(session.provider ?? 'unknown', 'neutral'),
    renderBadge(session.model ?? 'unknown', 'neutral')
  ].join(' ');
  const findings =
    session.findings.length === 0
      ? '<p style="margin:0;color:#475569;">No findings were recorded for this review.</p>'
      : `<div style="display:grid;gap:12px;">${session.findings
          .map((finding) => {
            const tone =
              finding.severity === 'critical'
                ? 'critical'
                : finding.severity === 'high'
                  ? 'fail'
                  : finding.severity === 'medium'
                    ? 'warn'
                    : 'neutral';

            return `<article style="border:1px solid rgba(148,163,184,.18); border-radius:16px; padding:16px; background:#fff;">
              <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">
                ${renderBadge(finding.severity.toUpperCase(), tone)}
                <strong style="font-size:15px;">${escapeHtml(finding.title)}</strong>
              </div>
              ${
                formatFindingLocation(finding)
                  ? `<p style="margin:0 0 8px;color:#334155;"><strong>File:</strong> ${escapeHtml(
                      formatFindingLocation(finding) ?? ''
                    )}</p>`
                  : ''
              }
              <p style="margin:0; color:#334155; line-height:1.6;">${escapeHtml(finding.summary)}</p>
              ${
                finding.excerpt
                  ? `<div style="margin-top:12px;">${renderCodeBlock(finding.excerpt)}</div>`
                  : ''
              }
              ${
                finding.suggestedAction
                  ? `<p style="margin:10px 0 0;color:#0f172a;"><strong>Next:</strong> ${escapeHtml(
                      finding.suggestedAction
                    )}</p>`
                  : ''
              }
            </article>`;
          })
          .join('')}</div>`;
  const terminalArtifact = session.artifacts.find((artifact) => artifact.kind === 'terminal');
  const rawArtifact = session.artifacts.find((artifact) => artifact.kind === 'raw-provider-output');

  return renderHtmlShell(
    session.summary,
    'Grouped context first, then findings, then review artifacts.',
    [
      renderSection(
        'Overview',
        `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;">${summaryBadges}</div>${renderKeyValueRows(
          [
            { label: 'Trace ID', value: session.traceId },
            { label: 'Policy', value: session.policyVersionId ?? 'not synced' },
            { label: 'Duration', value: `${session.durationMs} ms` },
            { label: 'Severity', value: formatSeveritySummary(session) }
          ]
        )}`
      ),
      renderSection('Review Context', renderReviewContext(session)),
      renderSection('Findings', findings),
      terminalArtifact
        ? renderSection('Rendered Terminal Report', renderCodeBlock(terminalArtifact.content ?? ''))
        : '',
      rawArtifact
        ? renderSection(
            'Raw Provider Output',
            `<details><summary style="cursor:pointer;font-weight:600;">Show raw artifact</summary><div style="margin-top:12px;">${renderCodeBlock(
              rawArtifact.content ?? ''
            )}</div></details>`
          )
        : ''
    ].filter(Boolean)
  );
}

export function renderHistoryHtml(entries: DiffmintHistoryEntry[]): string {
  const cards =
    entries.length === 0
      ? '<p style="margin:0;color:#475569;">No local or synced review sessions were found.</p>'
      : `<div style="display:grid;gap:12px;">${entries
          .map(
            (
              entry
            ) => `<article style="border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:16px;background:#fff;">
              <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px;">
                ${renderBadge((entry.status ?? 'unknown').toUpperCase(), entry.status === 'completed' ? 'ok' : 'neutral')}
                ${renderBadge(entry.provider ?? 'unknown', 'neutral')}
                <strong style="font-size:15px;">${escapeHtml(entry.summary ?? entry.traceId ?? 'Review session')}</strong>
              </div>
              <p style="margin:0 0 8px;color:#334155;">${escapeHtml(
                formatSeveritySummary(entry)
              )}</p>
              ${
                entry.context?.fileSummary
                  ? `<p style="margin:0 0 8px;color:#475569;"><strong>Scope:</strong> ${escapeHtml(
                      entry.context.fileSummary
                    )}</p>`
                  : ''
              }
              <p style="margin:0;color:#64748b;">${escapeHtml(
                [formatSourceLabel(entry.source), entry.commandSource]
                  .filter(Boolean)
                  .join(' · ') || 'No source metadata'
              )}</p>
            </article>`
          )
          .join('')}</div>`;

  return renderHtmlShell(
    'Review history from the current Diffmint home directory.',
    'Recent sessions stay grouped by summary, severity, and scope so the list remains scannable.',
    [renderSection('Recent Sessions', cards)]
  );
}

export function renderHistoryCompareHtml(
  left: ReviewSessionView,
  right: ReviewSessionView
): string {
  const leftTitles = new Set(left.findings.map((finding) => finding.title));
  const rightTitles = new Set(right.findings.map((finding) => finding.title));
  const leftOnly = left.findings.filter((finding) => !rightTitles.has(finding.title));
  const rightOnly = right.findings.filter((finding) => !leftTitles.has(finding.title));

  return renderHtmlShell(
    'Compare two recent review sessions.',
    'Use this view to confirm whether the latest review tightened scope, reduced severity, or introduced new findings.',
    [
      renderSection(
        'Session A',
        renderKeyValueRows([
          { label: 'Trace ID', value: left.traceId },
          { label: 'Summary', value: left.summary },
          { label: 'Severity', value: formatSeveritySummary(left) },
          { label: 'Scope', value: left.context?.fileSummary ?? 'No scope metadata' }
        ])
      ),
      renderSection(
        'Session B',
        renderKeyValueRows([
          { label: 'Trace ID', value: right.traceId },
          { label: 'Summary', value: right.summary },
          { label: 'Severity', value: formatSeveritySummary(right) },
          { label: 'Scope', value: right.context?.fileSummary ?? 'No scope metadata' }
        ])
      ),
      renderSection(
        'Finding Deltas',
        renderKeyValueRows([
          {
            label: 'Only in A',
            value:
              leftOnly.length === 0 ? 'None' : leftOnly.map((finding) => finding.title).join(', ')
          },
          {
            label: 'Only in B',
            value:
              rightOnly.length === 0 ? 'None' : rightOnly.map((finding) => finding.title).join(', ')
          }
        ])
      )
    ]
  );
}

export function renderDoctorChecksHtml(checks: DoctorCheckView[]): string {
  return renderHtmlShell(
    'Runtime, auth, and control-plane readiness for the current machine.',
    'Use this panel to spot missing providers, auth drift, or sync issues before starting a review.',
    [
      renderSection(
        'Checks',
        `<div style="display:grid;gap:12px;">${checks
          .map(
            (
              check
            ) => `<article style="display:flex;gap:12px;align-items:flex-start;border:1px solid rgba(148,163,184,.18);border-radius:16px;padding:14px;background:#fff;">
              <div>${renderBadge(check.status.toUpperCase(), check.status === 'ok' ? 'ok' : check.status === 'warn' ? 'warn' : 'fail')}</div>
              <div style="display:grid;gap:6px;">
                <strong>${escapeHtml(check.label)}</strong>
                <span style="color:#475569;line-height:1.6;">${escapeHtml(check.detail)}</span>
              </div>
            </article>`
          )
          .join('')}</div>`
      )
    ]
  );
}

export function renderWorkspaceSummaryHtml(
  config: DiffmintLocalConfig | null,
  rawOutput: string
): string {
  const workspace = config?.workspace;

  return renderHtmlShell(
    workspace ? `Connected to ${workspace.name}.` : 'Diffmint sign-in completed.',
    'The extension uses the local CLI for auth. This panel shows the resulting workspace context and raw command output.',
    [
      renderSection(
        'Workspace',
        renderKeyValueRows([
          { label: 'Workspace', value: workspace?.name ?? 'not configured' },
          { label: 'Slug', value: workspace?.slug ?? 'n/a' },
          { label: 'Provider', value: config?.provider ?? 'unknown' },
          { label: 'Policy', value: config?.policyVersionId ?? 'not synced' },
          { label: 'Control plane', value: config?.apiBaseUrl ?? 'default' }
        ])
      ),
      renderSection('Command Output', renderCodeBlock(rawOutput))
    ]
  );
}

export function renderPlainTextHtml(title: string, body: string, subtitle: string): string {
  return renderHtmlShell(title, subtitle, [renderSection('Output', renderCodeBlock(body))]);
}
