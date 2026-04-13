import type { ReviewSession } from '@diffmint/contracts';

export interface HistoryFilterOptions {
  provider?: string;
  policy?: string;
  source?: string;
  query?: string;
  limit?: number;
}

export interface HistoryCompareOptions {
  leftSelector: string;
  rightSelector: string;
}

function normalizeValue(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function buildSearchableText(entry: ReviewSession): string {
  return [
    entry.traceId,
    entry.summary,
    entry.provider,
    entry.model,
    entry.policyVersionId,
    entry.source,
    entry.commandSource,
    entry.context?.fileSummary,
    ...entry.findings.map((finding) => finding.title),
    ...entry.findings.map((finding) => finding.summary)
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
}

export function filterHistorySessions(
  entries: ReviewSession[],
  options: HistoryFilterOptions
): ReviewSession[] {
  const provider = normalizeValue(options.provider);
  const policy = normalizeValue(options.policy);
  const source = normalizeValue(options.source);
  const query = normalizeValue(options.query);

  const filtered = entries.filter((entry) => {
    if (provider && normalizeValue(entry.provider) !== provider) {
      return false;
    }

    if (policy && normalizeValue(entry.policyVersionId) !== policy) {
      return false;
    }

    if (source && normalizeValue(entry.source) !== source) {
      return false;
    }

    if (query && !buildSearchableText(entry).includes(query)) {
      return false;
    }

    return true;
  });

  if (options.limit && options.limit > 0) {
    return filtered.slice(0, options.limit);
  }

  return filtered;
}

function matchesSelector(entry: ReviewSession, selector: string, index: number): boolean {
  if (selector === 'latest') {
    return index === 0;
  }

  if (selector === 'previous') {
    return index === 1;
  }

  return entry.traceId === selector || entry.traceId.startsWith(selector);
}

export function findHistorySessionBySelector(
  entries: ReviewSession[],
  selector: string
): ReviewSession | null {
  const normalizedSelector = selector.trim().toLowerCase();

  for (const [index, entry] of entries.entries()) {
    if (matchesSelector(entry, normalizedSelector, index)) {
      return entry;
    }

    if (entry.traceId.toLowerCase().startsWith(normalizedSelector)) {
      return entry;
    }
  }

  return null;
}
