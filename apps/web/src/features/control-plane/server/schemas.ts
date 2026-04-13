import { z } from 'zod';

export const findingSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export const reviewSourceSchema = z.enum([
  'local_diff',
  'selected_files',
  'branch_compare',
  'pull_request',
  'pasted_diff',
  'commit_range'
]);
export const commandSourceSchema = z.enum(['cli', 'vscode', 'web']);
export const clientTypeSchema = z.enum(['cli', 'vscode']);
export const reviewStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export const releaseChannelSchema = z.enum(['stable', 'preview', 'canary']);
export const artifactKindSchema = z.enum([
  'markdown',
  'json',
  'terminal',
  'raw-provider-output',
  'diagnostic'
]);
export const usageEventSchema = z.enum([
  'review.started',
  'review.completed',
  'review.failed',
  'auth.login',
  'sync.uploaded'
]);

export const reviewSessionSchema = z.object({
  id: z.string().optional().default(''),
  traceId: z.string().min(1),
  workspaceId: z.string().optional(),
  requestId: z.string().min(1),
  source: reviewSourceSchema,
  commandSource: commandSourceSchema,
  provider: z.string().optional(),
  model: z.string().optional(),
  policyVersionId: z.string().optional(),
  status: reviewStatusSchema,
  findings: z
    .array(
      z.object({
        id: z.string(),
        severity: findingSeveritySchema,
        title: z.string(),
        summary: z.string(),
        filePath: z.string().optional(),
        line: z.number().optional(),
        endLine: z.number().optional(),
        excerpt: z.string().optional(),
        ruleId: z.string().optional(),
        suggestedAction: z.string().optional()
      })
    )
    .default([]),
  context: z
    .object({
      sourceLabel: z.string(),
      modeLabel: z.string(),
      branch: z.string().optional(),
      promptProfile: z.string().optional(),
      fileSummary: z.string(),
      visibleFiles: z.array(z.string()).default([]),
      remainingFileCount: z.number().int().nonnegative(),
      fileGroups: z
        .array(
          z.object({
            label: z.string(),
            count: z.number().int().nonnegative()
          })
        )
        .default([]),
      diffStats: z.object({
        fileCount: z.number().int().nonnegative(),
        additions: z.number().int().nonnegative(),
        deletions: z.number().int().nonnegative()
      })
    })
    .optional(),
  convention: z
    .object({
      promptProfile: z.string(),
      source: z.enum(['default', 'workspace-file']),
      filePath: z.string().optional(),
      additionalPriorities: z.array(z.string()).default([]),
      reviewNotes: z.array(z.string()).default([]),
      snippetContextLines: z.number().int().positive(),
      maxVisibleFiles: z.number().int().positive(),
      maxFileGroups: z.number().int().positive()
    })
    .optional(),
  summary: z.string().min(1),
  severityCounts: z.object({
    low: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    high: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative()
  }),
  durationMs: z.number().int().nonnegative(),
  startedAt: z.string().min(1),
  completedAt: z.string().optional(),
  artifacts: z
    .array(
      z.object({
        id: z.string(),
        kind: artifactKindSchema,
        label: z.string(),
        mimeType: z.string(),
        content: z.string().optional(),
        storageKey: z.string().optional()
      })
    )
    .default([])
});

export const usageEventInputSchema = z.object({
  workspaceId: z.string().optional(),
  actorId: z.string().optional(),
  source: commandSourceSchema,
  event: usageEventSchema,
  creditsDelta: z.number().optional(),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .optional()
});

export const deviceAuthStartSchema = z.object({
  workspaceId: z.string().optional()
});

export const deviceAuthActionSchema = z.object({
  deviceCode: z.string().min(1)
});

export const clientInstallationInputSchema = z.object({
  workspaceId: z.string().optional(),
  userId: z.string().optional(),
  clientType: clientTypeSchema,
  platform: z.string().min(1),
  version: z.string().min(1),
  channel: releaseChannelSchema.default('stable')
});
