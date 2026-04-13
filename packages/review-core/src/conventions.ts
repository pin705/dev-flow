import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ReviewConventionMetadata } from '@diffmint/contracts';

export interface ReviewConventionInspection {
  convention: ReviewConventionMetadata;
  status: 'default' | 'loaded' | 'invalid';
  detail: string;
}

const DEFAULT_REVIEW_CONVENTION: ReviewConventionMetadata = {
  promptProfile: 'diffmint-codex-compact-v1',
  source: 'default',
  additionalPriorities: [],
  reviewNotes: [],
  snippetContextLines: 2,
  maxVisibleFiles: 5,
  maxFileGroups: 6
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function toPositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

export function getReviewConventionPath(cwd: string): string {
  return path.join(cwd, '.diffmint', 'review-conventions.json');
}

export function inspectReviewConvention(cwd: string): ReviewConventionInspection {
  const conventionPath = getReviewConventionPath(cwd);

  if (!existsSync(conventionPath)) {
    return {
      convention: DEFAULT_REVIEW_CONVENTION,
      status: 'default',
      detail: 'Using built-in Diffmint review conventions.'
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(conventionPath, 'utf8')) as Record<string, unknown>;
    const convention: ReviewConventionMetadata = {
      promptProfile:
        typeof parsed.promptProfile === 'string' && parsed.promptProfile.trim().length > 0
          ? parsed.promptProfile.trim()
          : DEFAULT_REVIEW_CONVENTION.promptProfile,
      source: 'workspace-file',
      filePath: conventionPath,
      additionalPriorities: isStringArray(parsed.additionalPriorities)
        ? parsed.additionalPriorities.filter(Boolean)
        : [],
      reviewNotes: isStringArray(parsed.reviewNotes) ? parsed.reviewNotes.filter(Boolean) : [],
      snippetContextLines: toPositiveInteger(
        parsed.snippetContextLines,
        DEFAULT_REVIEW_CONVENTION.snippetContextLines
      ),
      maxVisibleFiles: toPositiveInteger(
        parsed.maxVisibleFiles,
        DEFAULT_REVIEW_CONVENTION.maxVisibleFiles
      ),
      maxFileGroups: toPositiveInteger(
        parsed.maxFileGroups,
        DEFAULT_REVIEW_CONVENTION.maxFileGroups
      )
    };

    return {
      convention,
      status: 'loaded',
      detail: `Loaded workspace review conventions from ${conventionPath}.`
    };
  } catch (error) {
    return {
      convention: DEFAULT_REVIEW_CONVENTION,
      status: 'invalid',
      detail:
        error instanceof Error
          ? `Invalid review convention file at ${conventionPath}: ${error.message}`
          : `Invalid review convention file at ${conventionPath}.`
    };
  }
}

export function resolveReviewConvention(cwd: string): ReviewConventionMetadata {
  return inspectReviewConvention(cwd).convention;
}
