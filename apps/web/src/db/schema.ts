import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
};

export const membershipRoleEnum = pgEnum('membership_role', [
  'owner',
  'admin',
  'member',
  'billing_admin',
  'auditor'
]);

export const providerModeEnum = pgEnum('provider_mode', ['managed', 'byok']);
export const reviewSourceEnum = pgEnum('review_source', [
  'local_diff',
  'selected_files',
  'branch_compare',
  'pull_request',
  'pasted_diff',
  'commit_range'
]);
export const commandSourceEnum = pgEnum('command_source', ['cli', 'vscode', 'web']);
export const sessionStatusEnum = pgEnum('review_session_status', [
  'queued',
  'running',
  'completed',
  'failed'
]);
export const artifactKindEnum = pgEnum('artifact_kind', [
  'markdown',
  'json',
  'terminal',
  'raw-provider-output',
  'diagnostic'
]);
export const releaseChannelEnum = pgEnum('release_channel', ['stable', 'preview', 'canary']);

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  clerkOrganizationId: varchar('clerk_organization_id', { length: 191 }).unique(),
  slug: varchar('slug', { length: 191 }).notNull().unique(),
  name: varchar('name', { length: 191 }).notNull(),
  cloudSyncEnabled: boolean('cloud_sync_enabled').default(true).notNull(),
  localOnlyDefault: boolean('local_only_default').default(false).notNull(),
  redactionEnabled: boolean('redaction_enabled').default(true).notNull(),
  ...timestamps
});

export const memberships = pgTable('memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  userId: varchar('user_id', { length: 191 }).notNull(),
  role: membershipRoleEnum('role').notNull(),
  ...timestamps
});

export const providerConfigs = pgTable('provider_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  provider: varchar('provider', { length: 64 }).notNull(),
  mode: providerModeEnum('mode').notNull(),
  defaultModel: varchar('default_model', { length: 128 }).notNull(),
  allowedModels: jsonb('allowed_models').$type<string[]>().notNull(),
  fallbackProvider: varchar('fallback_provider', { length: 128 }),
  rateLimitPerMinute: integer('rate_limit_per_minute'),
  encrypted: boolean('encrypted').default(true).notNull(),
  ...timestamps
});

export const policySets = pgTable('policy_sets', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  name: varchar('name', { length: 191 }).notNull(),
  summary: text('summary').notNull(),
  ...timestamps
});

export const policyVersions = pgTable('policy_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  policySetId: uuid('policy_set_id')
    .notNull()
    .references(() => policySets.id),
  version: varchar('version', { length: 64 }).notNull(),
  checksum: varchar('checksum', { length: 191 }).notNull(),
  checklist: jsonb('checklist').notNull(),
  rules: jsonb('rules').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  ...timestamps
});

export const reviewSessions = pgTable('review_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  requestId: varchar('request_id', { length: 191 }).notNull(),
  traceId: varchar('trace_id', { length: 191 }).notNull().unique(),
  source: reviewSourceEnum('source').notNull(),
  commandSource: commandSourceEnum('command_source').notNull(),
  provider: varchar('provider', { length: 64 }),
  model: varchar('model', { length: 128 }),
  policyVersionId: uuid('policy_version_id').references(() => policyVersions.id),
  status: sessionStatusEnum('status').notNull(),
  summary: text('summary').notNull(),
  severityCounts: jsonb('severity_counts').notNull(),
  durationMs: integer('duration_ms').default(0).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull(),
  ...timestamps
});

export const reviewArtifacts = pgTable('review_artifacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  reviewSessionId: uuid('review_session_id')
    .notNull()
    .references(() => reviewSessions.id),
  kind: artifactKindEnum('kind').notNull(),
  label: varchar('label', { length: 191 }).notNull(),
  mimeType: varchar('mime_type', { length: 191 }).notNull(),
  content: text('content'),
  storageKey: varchar('storage_key', { length: 255 }),
  ...timestamps
});

export const usageEvents = pgTable('usage_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id),
  actorId: varchar('actor_id', { length: 191 }),
  source: commandSourceEnum('source').notNull(),
  event: varchar('event', { length: 128 }).notNull(),
  creditsDelta: integer('credits_delta'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const deviceAuthSessions = pgTable('device_auth_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  deviceCode: varchar('device_code', { length: 191 }).notNull().unique(),
  userCode: varchar('user_code', { length: 32 }).notNull().unique(),
  verificationUri: varchar('verification_uri', { length: 255 }).notNull(),
  verificationUriComplete: varchar('verification_uri_complete', { length: 255 }),
  status: varchar('status', { length: 32 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  intervalSeconds: integer('interval_seconds').default(5).notNull(),
  ...timestamps
});

export const clientInstallations = pgTable('client_installations', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  userId: varchar('user_id', { length: 191 }),
  clientType: varchar('client_type', { length: 32 }).notNull(),
  platform: varchar('platform', { length: 64 }).notNull(),
  version: varchar('version', { length: 64 }).notNull(),
  channel: releaseChannelEnum('channel').default('stable').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
  ...timestamps
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id),
  actorId: varchar('actor_id', { length: 191 }),
  event: varchar('event', { length: 128 }).notNull(),
  targetType: varchar('target_type', { length: 64 }).notNull(),
  targetId: varchar('target_id', { length: 191 }).notNull(),
  detail: text('detail').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});

export const releaseChannels = pgTable('release_channels', {
  id: uuid('id').defaultRandom().primaryKey(),
  channel: releaseChannelEnum('channel').notNull(),
  version: varchar('version', { length: 64 }).notNull(),
  cliManifest: jsonb('cli_manifest').notNull(),
  vscodeManifest: jsonb('vscode_manifest').notNull(),
  notesUrl: varchar('notes_url', { length: 255 }),
  releasedAt: timestamp('released_at', { withTimezone: true }).notNull(),
  ...timestamps
});
