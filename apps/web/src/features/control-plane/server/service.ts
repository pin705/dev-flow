import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type {
  ClientInstallation,
  DeviceAuthSession,
  PolicyBundle,
  ProviderConfigSummary,
  ReleaseManifest,
  ReviewSession,
  UsageEvent,
  WorkspaceBootstrap
} from '@diffmint/contracts';
import { getDb } from '@/db/client';
import {
  auditEvents as auditEventsTable,
  billingAccounts,
  clientInstallations as clientInstallationsTable,
  deviceAuthSessions,
  policySets,
  policyVersions,
  providerConfigs,
  releaseChannels as releaseChannelsTable,
  reviewSessions as reviewSessionsTable,
  usageEvents as usageEventsTable,
  workspaces
} from '@/db/schema';
import type {
  BillingPlanKey,
  BillingSubscriptionStatus,
  BillingWorkspaceContext
} from '@/lib/billing/adapter';
import { getPolarConfig } from '@/lib/polar/config';
import {
  auditEvents as seededAuditEvents,
  billingWorkspaceSeed,
  policyBundles as seededPolicies,
  providerSummaries as seededProviders,
  releaseManifests as seededReleaseManifests,
  reviewSessions as seededReviewSessions,
  usageEvents as seededUsageEvents,
  workspaceQuotas,
  workspaceRole,
  workspaceSeed,
  workspaceSyncDefaults
} from '../data';
import {
  getPersistenceRequirementMessage,
  getPersistenceUnavailableMessage,
  isPersistenceRequired
} from '@/lib/runtime/persistence';
import { signReleaseManifests } from '@/lib/releases/manifest-signing';

export interface AuditEventRecord {
  id: string;
  event: string;
  actor: string;
  target: string;
  when: string;
  detail: string;
}

export interface OverviewStat {
  label: string;
  value: string;
  helper: string;
}

export interface BillingWorkspaceSnapshot {
  workspaceId: string;
  workspaceName: string;
  customerId?: string;
  planKey: BillingPlanKey;
  subscriptionStatus: BillingSubscriptionStatus;
  seatsUsed: number;
  seatLimit: number;
  creditsIncluded: number;
  creditsRemaining: number;
  spendCapUsd: number;
}

interface StoredDeviceAuthSession extends DeviceAuthSession {
  autoApproveOnPoll: boolean;
}

interface ControlPlaneState {
  workspace: WorkspaceBootstrap['workspace'];
  role: WorkspaceBootstrap['role'];
  quotas: WorkspaceBootstrap['quotas'];
  syncDefaults: WorkspaceBootstrap['syncDefaults'];
  providers: ProviderConfigSummary[];
  policies: PolicyBundle[];
  reviews: ReviewSession[];
  releases: ReleaseManifest[];
  usageEvents: UsageEvent[];
  auditEvents: AuditEventRecord[];
  clientInstallations: ClientInstallation[];
  deviceSessions: StoredDeviceAuthSession[];
  billing: BillingWorkspaceSnapshot;
  processedPolarWebhookKeys: string[];
}

interface PolarWebhookPayload {
  id?: string;
  timestamp?: string;
  type: string;
  data?: {
    id?: string;
    status?: string;
    seats?: number | null;
    productId?: string;
    product?: {
      id?: string;
    };
    metadata?: Record<string, unknown>;
    customerId?: string;
    customer?: {
      id?: string;
      externalId?: string | null;
      name?: string | null;
      metadata?: Record<string, unknown>;
    };
  };
}

type DbClient = NonNullable<ReturnType<typeof getDb>>;

declare global {
  // eslint-disable-next-line no-var
  var __diffmintControlPlaneState: ControlPlaneState | undefined;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getAppUrl(): string {
  return (
    process.env.DIFFMINT_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    'https://diffmint.io'
  );
}

function shouldAutoApproveDeviceFlow(): boolean {
  const configuredValue = process.env.DIFFMINT_DEVICE_FLOW_AUTO_APPROVE;

  if (configuredValue) {
    return configuredValue === 'true';
  }

  return process.env.NODE_ENV !== 'production';
}

function getApprovedDeviceSessionTtlMs(): number {
  const configuredValue = Number(process.env.DIFFMINT_DEVICE_SESSION_TTL_HOURS ?? 24 * 30);

  if (Number.isFinite(configuredValue) && configuredValue > 0) {
    return configuredValue * 60 * 60 * 1000;
  }

  return 24 * 30 * 60 * 60 * 1000;
}

function getApprovedDeviceSessionExpiresAt(): string {
  return new Date(Date.now() + getApprovedDeviceSessionTtlMs()).toISOString();
}

function isExpiredTimestamp(value: Date | string): boolean {
  const expiresAt = typeof value === 'string' ? new Date(value) : value;
  return expiresAt.getTime() <= Date.now();
}

function formatAuditTimestamp(date: Date | string): string {
  const normalized = typeof date === 'string' ? new Date(date) : date;
  return `${normalized.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function createSeedState(): ControlPlaneState {
  return {
    workspace: clone(workspaceSeed),
    role: workspaceRole,
    quotas: clone(workspaceQuotas),
    syncDefaults: clone(workspaceSyncDefaults),
    providers: clone(seededProviders),
    policies: clone(seededPolicies),
    reviews: clone(seededReviewSessions),
    releases: clone(seededReleaseManifests),
    usageEvents: clone(seededUsageEvents),
    auditEvents: clone(seededAuditEvents),
    clientInstallations: [],
    deviceSessions: [],
    billing: clone(billingWorkspaceSeed),
    processedPolarWebhookKeys: []
  };
}

function getState(): ControlPlaneState {
  globalThis.__diffmintControlPlaneState ??= createSeedState();
  return globalThis.__diffmintControlPlaneState;
}

function toPublicDeviceSession(session: StoredDeviceAuthSession): DeviceAuthSession {
  const { autoApproveOnPoll, ...publicSession } = session;
  void autoApproveOnPoll;
  return publicSession;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeBillingStatus(status?: string | null): BillingSubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
      return 'past_due';
    case 'canceled':
    case 'revoked':
      return 'canceled';
    default:
      return 'inactive';
  }
}

function normalizePlanKey(value?: string | null): BillingPlanKey {
  if (value === 'free' || value === 'pro' || value === 'team' || value === 'enterprise') {
    return value;
  }

  return 'team';
}

function buildPolarWebhookDeliveryKey(payload: PolarWebhookPayload): string | null {
  const eventId = asString(payload.id);

  if (eventId) {
    return `event:${eventId}`;
  }

  const timestamp = asString(payload.timestamp);

  if (!timestamp) {
    return null;
  }

  const entityId =
    asString(payload.data?.id) ??
    asString(payload.data?.customerId) ??
    asString(payload.data?.customer?.id) ??
    asString(payload.data?.customer?.externalId) ??
    asString(payload.data?.metadata?.workspaceId);

  if (!entityId) {
    return `${payload.type}:${timestamp}`;
  }

  return `${payload.type}:${entityId}:${timestamp}`;
}

function getProcessedPolarWebhookKeys(metadata: Record<string, unknown>): string[] {
  const keys = metadata.processedPolarWebhookKeys;

  if (!Array.isArray(keys)) {
    return [];
  }

  return keys.filter((key): key is string => typeof key === 'string' && key.length > 0);
}

function appendProcessedPolarWebhookKeys(existingKeys: string[], nextKey: string): string[] {
  const dedupedKeys = existingKeys.filter((key) => key !== nextKey);
  return [...dedupedKeys, nextKey].slice(-50);
}

function registerMemoryPolarWebhookDelivery(payload: PolarWebhookPayload): boolean {
  const key = buildPolarWebhookDeliveryKey(payload);

  if (!key) {
    return true;
  }

  const state = getState();

  if (state.processedPolarWebhookKeys.includes(key)) {
    return false;
  }

  state.processedPolarWebhookKeys = appendProcessedPolarWebhookKeys(
    state.processedPolarWebhookKeys,
    key
  );

  return true;
}

function createAuditEvent(event: Omit<AuditEventRecord, 'id' | 'when'>): AuditEventRecord {
  return {
    ...event,
    id: `audit-${randomUUID()}`,
    when: formatAuditTimestamp(new Date())
  };
}

function calculateQuotaRemainingPercent(creditsRemaining: number, creditsIncluded: number): number {
  if (creditsIncluded <= 0) {
    return 0;
  }

  return Math.round((creditsRemaining / creditsIncluded) * 100);
}

function buildOverviewStats(
  reviews: ReviewSession[],
  policies: PolicyBundle[],
  billing: BillingWorkspaceSnapshot
): OverviewStat[] {
  return [
    {
      label: 'Synced reviews',
      value: String(reviews.length),
      helper: `${reviews.filter((review) => review.commandSource === 'cli').length} from CLI`
    },
    {
      label: 'Active seats',
      value: `${billing.seatsUsed} / ${billing.seatLimit}`,
      helper: `${Math.max(billing.seatLimit - billing.seatsUsed, 0)} seats remaining`
    },
    {
      label: 'Published policies',
      value: String(policies.length),
      helper: `${policies[0]?.version ?? 'N/A'} is active`
    },
    {
      label: 'Quota remaining',
      value: `${calculateQuotaRemainingPercent(
        billing.creditsRemaining,
        billing.creditsIncluded
      )}%`,
      helper: 'Managed provider credits'
    }
  ];
}

function buildDeviceVerificationUri(
  deviceCode: string,
  appUrl?: string
): {
  verificationUri: string;
  verificationUriComplete: string;
} {
  const baseUrl = appUrl ?? getAppUrl();
  const verificationUri = new URL('/auth/device', baseUrl);
  const verificationUriComplete = new URL('/auth/device', baseUrl);
  verificationUriComplete.searchParams.set('device_code', deviceCode);

  return {
    verificationUri: verificationUri.toString(),
    verificationUriComplete: verificationUriComplete.toString()
  };
}

function normalizeReviewSession(input: ReviewSession, workspaceId: string): ReviewSession {
  return {
    ...input,
    id: input.id || `review-${randomUUID()}`,
    workspaceId: input.workspaceId ?? workspaceId,
    startedAt: input.startedAt ?? new Date().toISOString(),
    findings: input.findings ?? [],
    context: input.context,
    convention: input.convention,
    artifacts: input.artifacts ?? []
  };
}

function mapProviderSummaryFromRow(
  row: typeof providerConfigs.$inferSelect
): ProviderConfigSummary {
  return {
    id: row.id,
    provider: row.provider as ProviderConfigSummary['provider'],
    mode: row.mode,
    defaultModel: row.defaultModel,
    allowedModels: row.allowedModels,
    fallbackProvider: row.fallbackProvider ?? undefined,
    rateLimitPerMinute: row.rateLimitPerMinute ?? undefined,
    encrypted: row.encrypted,
    updatedAt: row.updatedAt.toISOString()
  };
}

function getExternalWorkspaceId(
  workspaceRow: Pick<typeof workspaces.$inferSelect, 'id' | 'slug' | 'clerkOrganizationId'>
): string {
  if (workspaceRow.clerkOrganizationId) {
    return workspaceRow.clerkOrganizationId;
  }

  if (workspaceRow.slug === workspaceSeed.slug) {
    return workspaceSeed.id;
  }

  return workspaceRow.id;
}

function mapPolicyBundlesFromRows(
  sets: Array<typeof policySets.$inferSelect>,
  versions: Array<typeof policyVersions.$inferSelect>,
  workspaceExternalId: string
): PolicyBundle[] {
  return versions
    .map((versionRow) => {
      const setRow = sets.find((item) => item.id === versionRow.policySetId);

      if (!setRow) {
        return null;
      }

      return {
        workspaceId: workspaceExternalId,
        policySetId: setRow.id,
        policyVersionId: versionRow.checksum,
        name: setRow.name,
        version: versionRow.version,
        checksum: versionRow.checksum,
        publishedAt: versionRow.publishedAt.toISOString(),
        summary: setRow.summary,
        checklist: versionRow.checklist as PolicyBundle['checklist'],
        rules: versionRow.rules as PolicyBundle['rules']
      };
    })
    .filter((item): item is PolicyBundle => Boolean(item))
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

function mapReleaseManifestFromRow(row: typeof releaseChannelsTable.$inferSelect): ReleaseManifest {
  return {
    channel: row.channel,
    version: row.version,
    releasedAt: row.releasedAt.toISOString(),
    cli: row.cliManifest as ReleaseManifest['cli'],
    vscode: row.vscodeManifest as ReleaseManifest['vscode'],
    notesUrl: row.notesUrl ?? undefined
  };
}

function mapReviewSessionFromRow(
  row: typeof reviewSessionsTable.$inferSelect,
  workspaceExternalId = workspaceSeed.id
): ReviewSession {
  const metadata = asRecord(row.metadata);

  return {
    id: row.id,
    traceId: row.traceId,
    workspaceId: asString(metadata.workspaceExternalId) ?? workspaceExternalId,
    requestId: row.requestId,
    source: row.source,
    commandSource: row.commandSource,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    policyVersionId: asString(metadata.policyVersionId),
    status: row.status,
    findings: Array.isArray(metadata.findings)
      ? (metadata.findings as ReviewSession['findings'])
      : [],
    context:
      metadata.context && typeof metadata.context === 'object'
        ? (metadata.context as ReviewSession['context'])
        : undefined,
    convention:
      metadata.convention && typeof metadata.convention === 'object'
        ? (metadata.convention as ReviewSession['convention'])
        : undefined,
    summary: row.summary,
    severityCounts: row.severityCounts as ReviewSession['severityCounts'],
    durationMs: row.durationMs,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    artifacts: Array.isArray(metadata.artifacts)
      ? (metadata.artifacts as ReviewSession['artifacts'])
      : []
  };
}

function mapUsageEventFromRow(
  row: typeof usageEventsTable.$inferSelect,
  workspaceExternalId = workspaceSeed.id
): UsageEvent {
  return {
    id: row.id,
    workspaceId: workspaceExternalId,
    actorId: row.actorId ?? undefined,
    source: row.source,
    event: row.event as UsageEvent['event'],
    creditsDelta: row.creditsDelta ?? undefined,
    metadata: row.metadata as UsageEvent['metadata'],
    createdAt: row.createdAt.toISOString()
  };
}

function mapClientInstallationFromRow(
  row: typeof clientInstallationsTable.$inferSelect,
  workspaceExternalId = workspaceSeed.id
): ClientInstallation {
  return {
    id: row.id,
    workspaceId: workspaceExternalId,
    userId: row.userId ?? undefined,
    clientType: row.clientType as ClientInstallation['clientType'],
    platform: row.platform,
    version: row.version,
    channel: row.channel,
    lastSeenAt: row.lastSeenAt.toISOString()
  };
}

function mapAuditEventFromRow(row: typeof auditEventsTable.$inferSelect): AuditEventRecord {
  const metadata = asRecord(row.metadata);

  return {
    id: row.id,
    event: row.event,
    actor: row.actorId ?? asString(metadata.actor) ?? 'System',
    target: asString(metadata.targetLabel) ?? row.targetId,
    when: formatAuditTimestamp(row.createdAt),
    detail: row.detail
  };
}

function mapBillingSnapshotFromRow(
  row: typeof billingAccounts.$inferSelect,
  context?: Partial<Pick<BillingWorkspaceContext, 'workspaceId' | 'workspaceName'>>
): BillingWorkspaceSnapshot {
  return {
    workspaceId: context?.workspaceId ?? workspaceSeed.id,
    workspaceName: context?.workspaceName ?? workspaceSeed.name,
    customerId: row.customerId ?? undefined,
    planKey: normalizePlanKey(row.planKey),
    subscriptionStatus: normalizeBillingStatus(row.status),
    seatsUsed: row.seatsUsed,
    seatLimit: row.seatLimit,
    creditsIncluded: row.creditsIncluded,
    creditsRemaining: row.creditsRemaining,
    spendCapUsd: row.spendCapUsd
  };
}

async function getWorkspaceRowByInternalId(
  db: DbClient,
  internalWorkspaceId: string | null
): Promise<typeof workspaces.$inferSelect | null> {
  if (!internalWorkspaceId) {
    return null;
  }

  const [workspaceRow] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, internalWorkspaceId))
    .limit(1);

  return workspaceRow ?? null;
}

async function mapDeviceSessionFromRow(
  db: DbClient,
  row: typeof deviceAuthSessions.$inferSelect
): Promise<DeviceAuthSession> {
  const workspaceRow = await getWorkspaceRowByInternalId(db, row.workspaceId ?? null);

  return {
    deviceCode: row.deviceCode,
    userCode: row.userCode,
    verificationUri: row.verificationUri,
    verificationUriComplete: row.verificationUriComplete ?? undefined,
    expiresAt: row.expiresAt.toISOString(),
    intervalSeconds: row.intervalSeconds,
    status: row.status as DeviceAuthSession['status'],
    workspaceId: workspaceRow ? getExternalWorkspaceId(workspaceRow) : workspaceSeed.id
  };
}

function getDbClient(): DbClient | null {
  if (process.env.DIFFMINT_FORCE_MEMORY_STATE === 'true') {
    return null;
  }

  try {
    return getDb();
  } catch {
    return null;
  }
}

async function withPersistence<T>(
  memoryFallback: () => T | Promise<T>,
  dbRunner: (db: DbClient) => Promise<T>
): Promise<T> {
  const db = getDbClient();
  const persistenceRequired = isPersistenceRequired();

  if (!db) {
    if (persistenceRequired) {
      throw new Error(getPersistenceRequirementMessage());
    }

    return await memoryFallback();
  }

  try {
    return await dbRunner(db);
  } catch (error) {
    if (persistenceRequired) {
      throw new Error(
        getPersistenceUnavailableMessage(error instanceof Error ? error.message : String(error))
      );
    }

    return await memoryFallback();
  }
}

async function getWorkspaceRow(
  db: DbClient,
  externalWorkspaceId?: string
): Promise<typeof workspaces.$inferSelect> {
  const requestedOrgId =
    externalWorkspaceId && externalWorkspaceId !== workspaceSeed.id ? externalWorkspaceId : null;

  if (requestedOrgId) {
    const [byOrg] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.clerkOrganizationId, requestedOrgId))
      .limit(1);

    if (byOrg) {
      return byOrg;
    }
  }

  const [bySlug] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSeed.slug))
    .limit(1);

  if (bySlug) {
    if (requestedOrgId && !bySlug.clerkOrganizationId) {
      const [updated] = await db
        .update(workspaces)
        .set({
          clerkOrganizationId: requestedOrgId,
          updatedAt: new Date()
        })
        .where(eq(workspaces.id, bySlug.id))
        .returning();

      return updated ?? bySlug;
    }

    return bySlug;
  }

  const [inserted] = await db
    .insert(workspaces)
    .values({
      slug: workspaceSeed.slug,
      name: workspaceSeed.name,
      clerkOrganizationId: requestedOrgId,
      cloudSyncEnabled: workspaceSyncDefaults.cloudSyncEnabled,
      localOnlyDefault: workspaceSyncDefaults.localOnlyDefault,
      redactionEnabled: workspaceSyncDefaults.redactionEnabled
    })
    .returning();

  return inserted;
}

async function ensureStaticSeed(
  db: DbClient,
  workspaceRow: typeof workspaces.$inferSelect
): Promise<void> {
  const existingProviders = await db
    .select()
    .from(providerConfigs)
    .where(eq(providerConfigs.workspaceId, workspaceRow.id));

  if (existingProviders.length === 0) {
    await db.insert(providerConfigs).values(
      seededProviders.map((provider) => ({
        workspaceId: workspaceRow.id,
        provider: provider.provider,
        mode: provider.mode,
        defaultModel: provider.defaultModel,
        allowedModels: provider.allowedModels,
        fallbackProvider: provider.fallbackProvider ?? null,
        rateLimitPerMinute: provider.rateLimitPerMinute ?? null,
        encrypted: provider.encrypted
      }))
    );
  }

  const existingPolicySets = await db
    .select()
    .from(policySets)
    .where(eq(policySets.workspaceId, workspaceRow.id));

  for (const seededPolicy of seededPolicies) {
    let policySetRow = existingPolicySets.find((item) => item.name === seededPolicy.name);

    if (!policySetRow) {
      const [insertedSet] = await db
        .insert(policySets)
        .values({
          workspaceId: workspaceRow.id,
          name: seededPolicy.name,
          summary: seededPolicy.summary
        })
        .returning();

      policySetRow = insertedSet;
      existingPolicySets.push(insertedSet);
    }

    const [existingVersion] = await db
      .select()
      .from(policyVersions)
      .where(
        and(
          eq(policyVersions.policySetId, policySetRow.id),
          eq(policyVersions.version, seededPolicy.version)
        )
      )
      .limit(1);

    if (!existingVersion) {
      await db.insert(policyVersions).values({
        policySetId: policySetRow.id,
        version: seededPolicy.version,
        checksum: seededPolicy.policyVersionId,
        checklist: seededPolicy.checklist,
        rules: seededPolicy.rules,
        publishedAt: new Date(seededPolicy.publishedAt)
      });
    }
  }

  const existingBilling = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.workspaceId, workspaceRow.id))
    .limit(1);

  if (existingBilling.length === 0) {
    const productIds = Object.entries(getPolarConfig().productIds).reduce<Record<string, string>>(
      (accumulator, [key, value]) => {
        if (typeof value === 'string') {
          accumulator[key] = value;
        }

        return accumulator;
      },
      {}
    );

    await db.insert(billingAccounts).values({
      workspaceId: workspaceRow.id,
      provider: 'polar',
      customerId: billingWorkspaceSeed.customerId ?? null,
      planKey: billingWorkspaceSeed.planKey,
      status: billingWorkspaceSeed.subscriptionStatus,
      seatsUsed: billingWorkspaceSeed.seatsUsed,
      seatLimit: billingWorkspaceSeed.seatLimit,
      creditsIncluded: billingWorkspaceSeed.creditsIncluded,
      creditsRemaining: billingWorkspaceSeed.creditsRemaining,
      spendCapUsd: billingWorkspaceSeed.spendCapUsd,
      productIds,
      metadata: {
        workspaceExternalId: workspaceSeed.id
      }
    });
  }

  const existingReleases = await db.select().from(releaseChannelsTable);
  if (existingReleases.length === 0) {
    await db.insert(releaseChannelsTable).values(
      seededReleaseManifests.map((release) => ({
        channel: release.channel,
        version: release.version,
        cliManifest: release.cli,
        vscodeManifest: release.vscode,
        notesUrl: release.notesUrl ?? null,
        releasedAt: new Date(release.releasedAt)
      }))
    );
  }

  const existingReviews = await db
    .select()
    .from(reviewSessionsTable)
    .where(eq(reviewSessionsTable.workspaceId, workspaceRow.id))
    .limit(1);

  if (existingReviews.length === 0) {
    await db.insert(reviewSessionsTable).values(
      seededReviewSessions.map((session) => ({
        workspaceId: workspaceRow.id,
        requestId: session.requestId,
        traceId: session.traceId,
        source: session.source,
        commandSource: session.commandSource,
        provider: session.provider ?? null,
        model: session.model ?? null,
        policyVersionId: null,
        status: session.status,
        summary: session.summary,
        severityCounts: session.severityCounts,
        durationMs: session.durationMs,
        startedAt: new Date(session.startedAt),
        completedAt: session.completedAt ? new Date(session.completedAt) : null,
        metadata: {
          findings: session.findings,
          artifacts: session.artifacts,
          workspaceExternalId: workspaceSeed.id,
          policyVersionId: session.policyVersionId
        }
      }))
    );
  }

  const existingUsage = await db
    .select()
    .from(usageEventsTable)
    .where(eq(usageEventsTable.workspaceId, workspaceRow.id))
    .limit(1);

  if (existingUsage.length === 0) {
    await db.insert(usageEventsTable).values(
      seededUsageEvents.map((event) => ({
        workspaceId: workspaceRow.id,
        actorId: event.actorId ?? null,
        source: event.source,
        event: event.event,
        creditsDelta: event.creditsDelta ?? null,
        metadata: event.metadata ?? null,
        createdAt: new Date(event.createdAt)
      }))
    );
  }

  const existingAudit = await db
    .select()
    .from(auditEventsTable)
    .where(eq(auditEventsTable.workspaceId, workspaceRow.id))
    .limit(1);

  if (existingAudit.length === 0) {
    await db.insert(auditEventsTable).values(
      seededAuditEvents.map((event) => ({
        workspaceId: workspaceRow.id,
        actorId: event.actor,
        event: event.event,
        targetType: 'control_plane',
        targetId: event.target,
        detail: event.detail,
        metadata: {
          targetLabel: event.target,
          when: event.when
        }
      }))
    );
  }
}

async function listProvidersPersistent(
  db: DbClient,
  externalWorkspaceId?: string
): Promise<ProviderConfigSummary[]> {
  const workspaceRow = await getWorkspaceRow(db, externalWorkspaceId);
  await ensureStaticSeed(db, workspaceRow);
  const rows = await db
    .select()
    .from(providerConfigs)
    .where(eq(providerConfigs.workspaceId, workspaceRow.id))
    .orderBy(asc(providerConfigs.provider), asc(providerConfigs.mode));

  return rows.map(mapProviderSummaryFromRow);
}

async function listPoliciesPersistent(
  db: DbClient,
  externalWorkspaceId?: string
): Promise<PolicyBundle[]> {
  const workspaceRow = await getWorkspaceRow(db, externalWorkspaceId);
  await ensureStaticSeed(db, workspaceRow);
  const setRows = await db
    .select()
    .from(policySets)
    .where(eq(policySets.workspaceId, workspaceRow.id))
    .orderBy(asc(policySets.name));
  const versionRows = await db
    .select()
    .from(policyVersions)
    .orderBy(desc(policyVersions.publishedAt));

  return mapPolicyBundlesFromRows(
    setRows,
    versionRows.filter((versionRow) =>
      setRows.some((setRow) => setRow.id === versionRow.policySetId)
    ),
    getExternalWorkspaceId(workspaceRow)
  );
}

async function listReleaseManifestsPersistent(db: DbClient): Promise<ReleaseManifest[]> {
  const rows = await db
    .select()
    .from(releaseChannelsTable)
    .orderBy(desc(releaseChannelsTable.releasedAt));
  return rows.map(mapReleaseManifestFromRow);
}

async function listReviewSessionsPersistent(
  db: DbClient,
  externalWorkspaceId?: string
): Promise<ReviewSession[]> {
  const workspaceRow = await getWorkspaceRow(db, externalWorkspaceId);
  await ensureStaticSeed(db, workspaceRow);
  const rows = await db
    .select()
    .from(reviewSessionsTable)
    .where(eq(reviewSessionsTable.workspaceId, workspaceRow.id))
    .orderBy(desc(reviewSessionsTable.startedAt));

  return rows.map((row) => mapReviewSessionFromRow(row, getExternalWorkspaceId(workspaceRow)));
}

async function listUsageEventsPersistent(
  db: DbClient,
  externalWorkspaceId?: string
): Promise<UsageEvent[]> {
  const workspaceRow = await getWorkspaceRow(db, externalWorkspaceId);
  await ensureStaticSeed(db, workspaceRow);
  const rows = await db
    .select()
    .from(usageEventsTable)
    .where(eq(usageEventsTable.workspaceId, workspaceRow.id))
    .orderBy(desc(usageEventsTable.createdAt));

  return rows.map((row) => mapUsageEventFromRow(row, getExternalWorkspaceId(workspaceRow)));
}

async function listAuditEventsPersistent(
  db: DbClient,
  externalWorkspaceId?: string
): Promise<AuditEventRecord[]> {
  const workspaceRow = await getWorkspaceRow(db, externalWorkspaceId);
  await ensureStaticSeed(db, workspaceRow);
  const rows = await db
    .select()
    .from(auditEventsTable)
    .where(eq(auditEventsTable.workspaceId, workspaceRow.id))
    .orderBy(desc(auditEventsTable.createdAt));

  return rows.map(mapAuditEventFromRow);
}

async function listClientInstallationsPersistent(
  db: DbClient,
  externalWorkspaceId?: string
): Promise<ClientInstallation[]> {
  const workspaceRow = await getWorkspaceRow(db, externalWorkspaceId);
  await ensureStaticSeed(db, workspaceRow);
  const rows = await db
    .select()
    .from(clientInstallationsTable)
    .where(eq(clientInstallationsTable.workspaceId, workspaceRow.id))
    .orderBy(desc(clientInstallationsTable.lastSeenAt), asc(clientInstallationsTable.clientType));

  return rows.map((row) => mapClientInstallationFromRow(row, getExternalWorkspaceId(workspaceRow)));
}

async function getBillingSnapshotPersistent(
  db: DbClient,
  context?: Partial<Pick<BillingWorkspaceContext, 'workspaceId' | 'workspaceName'>>
): Promise<BillingWorkspaceSnapshot> {
  const workspaceRow = await getWorkspaceRow(db, context?.workspaceId);
  await ensureStaticSeed(db, workspaceRow);
  const [row] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.workspaceId, workspaceRow.id))
    .limit(1);

  return mapBillingSnapshotFromRow(row, {
    ...context,
    workspaceId: context?.workspaceId ?? getExternalWorkspaceId(workspaceRow),
    workspaceName: context?.workspaceName ?? workspaceRow.name
  });
}

async function createUsageEventPersistent(
  db: DbClient,
  event: Omit<UsageEvent, 'id' | 'createdAt' | 'workspaceId'> & { workspaceId?: string }
): Promise<UsageEvent> {
  const workspaceRow = await getWorkspaceRow(db, event.workspaceId);
  await ensureStaticSeed(db, workspaceRow);
  const [row] = await db
    .insert(usageEventsTable)
    .values({
      workspaceId: workspaceRow.id,
      actorId: event.actorId ?? null,
      source: event.source,
      event: event.event,
      creditsDelta: event.creditsDelta ?? null,
      metadata: event.metadata ?? null
    })
    .returning();

  return mapUsageEventFromRow(row, getExternalWorkspaceId(workspaceRow));
}

async function registerClientInstallationPersistent(
  db: DbClient,
  installation: Omit<ClientInstallation, 'id' | 'lastSeenAt' | 'workspaceId'> & {
    workspaceId?: string;
  }
): Promise<ClientInstallation> {
  const workspaceRow = await getWorkspaceRow(db, installation.workspaceId);
  await ensureStaticSeed(db, workspaceRow);

  const matchConditions = [
    eq(clientInstallationsTable.workspaceId, workspaceRow.id),
    eq(clientInstallationsTable.clientType, installation.clientType),
    eq(clientInstallationsTable.platform, installation.platform),
    eq(clientInstallationsTable.channel, installation.channel),
    installation.userId
      ? eq(clientInstallationsTable.userId, installation.userId)
      : isNull(clientInstallationsTable.userId)
  ];

  const [existing] = await db
    .select()
    .from(clientInstallationsTable)
    .where(and(...matchConditions))
    .orderBy(desc(clientInstallationsTable.lastSeenAt))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(clientInstallationsTable)
      .set({
        version: installation.version,
        lastSeenAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(clientInstallationsTable.id, existing.id))
      .returning();

    if (existing.version !== installation.version) {
      await appendAuditEventPersistent(db, getExternalWorkspaceId(workspaceRow), {
        actorId: installation.userId ?? `Diffmint ${installation.clientType.toUpperCase()}`,
        event: 'client.installation_updated',
        targetType: 'client_installation',
        targetId: updated.id,
        detail: `Updated ${installation.clientType} installation to ${installation.version}.`,
        metadata: {
          targetLabel: `${installation.clientType}:${installation.platform}:${installation.channel}`
        }
      });
    }

    return mapClientInstallationFromRow(updated, getExternalWorkspaceId(workspaceRow));
  }

  const [inserted] = await db
    .insert(clientInstallationsTable)
    .values({
      workspaceId: workspaceRow.id,
      userId: installation.userId ?? null,
      clientType: installation.clientType,
      platform: installation.platform,
      version: installation.version,
      channel: installation.channel
    })
    .returning();

  await appendAuditEventPersistent(db, getExternalWorkspaceId(workspaceRow), {
    actorId: installation.userId ?? `Diffmint ${installation.clientType.toUpperCase()}`,
    event: 'client.installation_registered',
    targetType: 'client_installation',
    targetId: inserted.id,
    detail: `Registered ${installation.clientType} ${installation.version} on ${installation.platform}.`,
    metadata: {
      targetLabel: `${installation.clientType}:${installation.platform}:${installation.channel}`
    }
  });

  return mapClientInstallationFromRow(inserted, getExternalWorkspaceId(workspaceRow));
}

async function appendAuditEventPersistent(
  db: DbClient,
  externalWorkspaceId: string | undefined,
  record: Omit<typeof auditEventsTable.$inferInsert, 'workspaceId'>
): Promise<void> {
  const workspaceRow = await getWorkspaceRow(db, externalWorkspaceId);
  await db.insert(auditEventsTable).values({
    workspaceId: workspaceRow.id,
    ...record
  });
}

function extractPolarWorkspaceId(payload: PolarWebhookPayload): string | undefined {
  return (
    asString(payload.data?.metadata?.workspaceId) ??
    asString(payload.data?.customer?.externalId) ??
    asString(payload.data?.customerId)
  );
}

function extractPolarCustomerId(payload: PolarWebhookPayload): string | undefined {
  return asString(payload.data?.customer?.id) ?? asString(payload.data?.customerId);
}

function resolvePlanKeyFromPolarPayload(payload: PolarWebhookPayload): BillingPlanKey | undefined {
  const metadataPlanKey = normalizePlanKey(asString(payload.data?.metadata?.planKey));
  if (asString(payload.data?.metadata?.planKey)) {
    return metadataPlanKey;
  }

  const productId = asString(payload.data?.product?.id) ?? asString(payload.data?.productId);
  const productIds = getPolarConfig().productIds;

  if (productId && productIds.pro === productId) {
    return 'pro';
  }

  if (productId && productIds.team === productId) {
    return 'team';
  }

  if (productId && productIds.enterprise === productId) {
    return 'enterprise';
  }

  return undefined;
}

function updateMemoryBillingState(payload: PolarWebhookPayload): void {
  if (!registerMemoryPolarWebhookDelivery(payload)) {
    return;
  }

  const state = getState();
  const nextPlanKey = resolvePlanKeyFromPolarPayload(payload);
  const nextStatus =
    payload.type === 'order.paid'
      ? 'active'
      : normalizeBillingStatus(asString(payload.data?.status) ?? state.billing.subscriptionStatus);
  const seats = asNumber(payload.data?.seats) ?? state.billing.seatLimit;

  state.billing = {
    ...state.billing,
    customerId: extractPolarCustomerId(payload) ?? state.billing.customerId,
    planKey: nextPlanKey ?? state.billing.planKey,
    subscriptionStatus: nextStatus,
    seatLimit: seats,
    seatsUsed: Math.min(state.billing.seatsUsed, seats)
  };

  state.auditEvents = [
    createAuditEvent({
      event: `polar.${payload.type.replaceAll('.', '_')}`,
      actor: 'Polar Webhook',
      target: extractPolarCustomerId(payload) ?? state.billing.workspaceId,
      detail: `Processed Polar event ${payload.type} for ${state.billing.workspaceName}.`
    }),
    ...state.auditEvents
  ];
}

async function applyPolarWebhookPersistent(
  db: DbClient,
  payload: PolarWebhookPayload
): Promise<void> {
  const workspaceId = extractPolarWorkspaceId(payload);
  const workspaceRow = await getWorkspaceRow(db, workspaceId);
  await ensureStaticSeed(db, workspaceRow);
  const [current] = await db
    .select()
    .from(billingAccounts)
    .where(eq(billingAccounts.workspaceId, workspaceRow.id))
    .limit(1);

  if (!current) {
    return;
  }

  const currentMetadata = asRecord(current.metadata);
  const deliveryKey = buildPolarWebhookDeliveryKey(payload);
  const processedKeys = getProcessedPolarWebhookKeys(currentMetadata);

  if (deliveryKey && processedKeys.includes(deliveryKey)) {
    return;
  }

  const nextPlanKey = resolvePlanKeyFromPolarPayload(payload) ?? normalizePlanKey(current.planKey);
  const nextStatus =
    payload.type === 'order.paid'
      ? 'active'
      : normalizeBillingStatus(asString(payload.data?.status) ?? current.status);
  const seats = asNumber(payload.data?.seats) ?? current.seatLimit;
  const customerId = extractPolarCustomerId(payload) ?? current.customerId ?? undefined;
  const subscriptionId = asString(payload.data?.id) ?? current.subscriptionId ?? undefined;

  await db
    .update(billingAccounts)
    .set({
      customerId: customerId ?? null,
      subscriptionId: subscriptionId ?? null,
      planKey: nextPlanKey,
      status: nextStatus,
      seatLimit: seats,
      seatsUsed: Math.min(current.seatsUsed, seats),
      metadata: {
        ...currentMetadata,
        lastPolarEvent: payload.type,
        lastPolarPayload: payload.data ?? null,
        processedPolarWebhookKeys:
          deliveryKey === null
            ? processedKeys
            : appendProcessedPolarWebhookKeys(processedKeys, deliveryKey)
      },
      updatedAt: new Date()
    })
    .where(eq(billingAccounts.id, current.id));

  await appendAuditEventPersistent(db, workspaceId, {
    actorId: 'Polar Webhook',
    event: `polar.${payload.type.replaceAll('.', '_')}`,
    targetType: 'billing_account',
    targetId: customerId ?? current.id,
    detail: `Processed Polar event ${payload.type}.`,
    metadata: {
      targetLabel: customerId ?? current.id,
      payloadType: payload.type
    }
  });
}

async function recordReviewSessionPersistent(
  db: DbClient,
  session: ReviewSession
): Promise<ReviewSession> {
  const normalized = normalizeReviewSession(session, workspaceSeed.id);
  const workspaceRow = await getWorkspaceRow(db, normalized.workspaceId);
  await ensureStaticSeed(db, workspaceRow);
  const metadata = {
    findings: normalized.findings,
    context: normalized.context,
    convention: normalized.convention,
    artifacts: normalized.artifacts,
    workspaceExternalId: normalized.workspaceId,
    policyVersionId: normalized.policyVersionId
  };

  const [row] = await db
    .insert(reviewSessionsTable)
    .values({
      workspaceId: workspaceRow.id,
      requestId: normalized.requestId,
      traceId: normalized.traceId,
      source: normalized.source,
      commandSource: normalized.commandSource,
      provider: normalized.provider ?? null,
      model: normalized.model ?? null,
      policyVersionId: null,
      status: normalized.status,
      summary: normalized.summary,
      severityCounts: normalized.severityCounts,
      durationMs: normalized.durationMs,
      startedAt: new Date(normalized.startedAt),
      completedAt: normalized.completedAt ? new Date(normalized.completedAt) : null,
      metadata
    })
    .onConflictDoUpdate({
      target: reviewSessionsTable.traceId,
      set: {
        summary: normalized.summary,
        status: normalized.status,
        severityCounts: normalized.severityCounts,
        durationMs: normalized.durationMs,
        completedAt: normalized.completedAt ? new Date(normalized.completedAt) : null,
        metadata,
        updatedAt: new Date()
      }
    })
    .returning();

  await db.insert(usageEventsTable).values({
    workspaceId: workspaceRow.id,
    actorId: null,
    source: normalized.commandSource,
    event: normalized.status === 'failed' ? 'review.failed' : 'review.completed',
    creditsDelta: -Math.max(250, normalized.findings.length * 100),
    metadata: {
      traceId: normalized.traceId,
      provider: normalized.provider ?? 'unknown',
      model: normalized.model ?? 'unknown'
    }
  });

  await appendAuditEventPersistent(db, normalized.workspaceId, {
    actorId: `Diffmint ${normalized.commandSource.toUpperCase()}`,
    event: 'review.synced',
    targetType: 'review_session',
    targetId: normalized.traceId,
    detail: `Uploaded ${normalized.summary}`,
    metadata: {
      targetLabel: normalized.traceId
    }
  });

  return mapReviewSessionFromRow(row, getExternalWorkspaceId(workspaceRow));
}

function mapMemoryBootstrap(workspaceId?: string): WorkspaceBootstrap {
  const state = getState();
  return {
    workspace: {
      ...clone(state.workspace),
      id: workspaceId ?? state.workspace.id
    },
    role: state.role,
    policy: clone(state.policies[0]),
    provider: clone(state.providers[0]),
    quotas: clone(state.quotas),
    syncDefaults: clone(state.syncDefaults),
    releaseChannels: state.releases.map((release) => release.channel)
  };
}

export async function ensureControlPlaneSeedData(workspaceId?: string): Promise<void> {
  await withPersistence(
    () => {
      getState();
    },
    async (db) => {
      const workspaceRow = await getWorkspaceRow(db, workspaceId);
      await ensureStaticSeed(db, workspaceRow);
    }
  );
}

export async function getWorkspaceBootstrap(workspaceId?: string): Promise<WorkspaceBootstrap> {
  return withPersistence(
    () => mapMemoryBootstrap(workspaceId),
    async (db) => {
      const workspaceRow = await getWorkspaceRow(db, workspaceId);
      await ensureStaticSeed(db, workspaceRow);
      const externalWorkspaceId = getExternalWorkspaceId(workspaceRow);
      const [providers, policies, releases, billing] = await Promise.all([
        listProvidersPersistent(db, externalWorkspaceId),
        listPoliciesPersistent(db, externalWorkspaceId),
        listReleaseManifestsPersistent(db),
        getBillingSnapshotPersistent(db, {
          workspaceId: externalWorkspaceId,
          workspaceName: workspaceRow.name
        })
      ]);

      return {
        workspace: {
          id: externalWorkspaceId,
          slug: workspaceRow.slug,
          name: workspaceRow.name
        },
        role: workspaceRole,
        policy: policies[0] ?? clone(seededPolicies[0]),
        provider: providers[0] ?? clone(seededProviders[0]),
        quotas: {
          includedCredits: billing.creditsIncluded,
          remainingCredits: billing.creditsRemaining,
          seats: billing.seatsUsed,
          seatLimit: billing.seatLimit,
          spendCapUsd: billing.spendCapUsd
        },
        syncDefaults: {
          cloudSyncEnabled: workspaceRow.cloudSyncEnabled,
          localOnlyDefault: workspaceRow.localOnlyDefault,
          redactionEnabled: workspaceRow.redactionEnabled
        },
        releaseChannels: releases.map((release) => release.channel)
      };
    }
  );
}

export async function listProviders(workspaceId?: string): Promise<ProviderConfigSummary[]> {
  return withPersistence(
    () => clone(getState().providers),
    async (db) => listProvidersPersistent(db, workspaceId)
  );
}

export async function listPolicies(workspaceId?: string): Promise<PolicyBundle[]> {
  return withPersistence(
    () => clone(getState().policies),
    async (db) => listPoliciesPersistent(db, workspaceId)
  );
}

export async function listReviewSessions(workspaceId?: string): Promise<ReviewSession[]> {
  return withPersistence(
    () => clone(getState().reviews),
    async (db) => listReviewSessionsPersistent(db, workspaceId)
  );
}

export async function listAuditEvents(workspaceId?: string): Promise<AuditEventRecord[]> {
  return withPersistence(
    () => clone(getState().auditEvents),
    async (db) => listAuditEventsPersistent(db, workspaceId)
  );
}

export async function listClientInstallations(workspaceId?: string): Promise<ClientInstallation[]> {
  return withPersistence(
    () =>
      clone(getState().clientInstallations).filter((item) =>
        workspaceId ? item.workspaceId === workspaceId : true
      ),
    async (db) => listClientInstallationsPersistent(db, workspaceId)
  );
}

export async function listReleaseManifests(): Promise<ReleaseManifest[]> {
  const manifests = await withPersistence(
    () => clone(getState().releases),
    async (db) => listReleaseManifestsPersistent(db)
  );

  return signReleaseManifests(manifests);
}

export async function listUsageEvents(workspaceId?: string): Promise<UsageEvent[]> {
  return withPersistence(
    () => clone(getState().usageEvents),
    async (db) => listUsageEventsPersistent(db, workspaceId)
  );
}

export async function getOverviewStats(workspaceId?: string): Promise<OverviewStat[]> {
  const [reviews, policies, billing] = await Promise.all([
    listReviewSessions(workspaceId),
    listPolicies(workspaceId),
    getBillingWorkspaceSnapshot(
      workspaceId
        ? {
            workspaceId
          }
        : undefined
    )
  ]);

  return buildOverviewStats(reviews, policies, billing);
}

export async function getBillingWorkspaceSnapshot(
  context?: Partial<Pick<BillingWorkspaceContext, 'workspaceId' | 'workspaceName'>>
): Promise<BillingWorkspaceSnapshot> {
  return withPersistence(
    () => {
      const snapshot = clone(getState().billing);

      if (context?.workspaceId) {
        snapshot.workspaceId = context.workspaceId;
      }

      if (context?.workspaceName) {
        snapshot.workspaceName = context.workspaceName;
      }

      return snapshot;
    },
    async (db) => getBillingSnapshotPersistent(db, context)
  );
}

export async function recordReviewSession(session: ReviewSession): Promise<ReviewSession> {
  return withPersistence(
    () => {
      const state = getState();
      const normalized = normalizeReviewSession(session, state.workspace.id);

      state.reviews = [
        normalized,
        ...state.reviews.filter((item) => item.traceId !== normalized.traceId)
      ];

      state.usageEvents = [
        {
          id: `usage-${randomUUID()}`,
          workspaceId: normalized.workspaceId ?? state.workspace.id,
          source: normalized.commandSource,
          event: normalized.status === 'failed' ? 'review.failed' : 'review.completed',
          creditsDelta: -Math.max(250, normalized.findings.length * 100),
          metadata: {
            traceId: normalized.traceId,
            provider: normalized.provider ?? 'unknown',
            model: normalized.model ?? 'unknown'
          },
          createdAt: new Date().toISOString()
        },
        ...state.usageEvents
      ];

      state.auditEvents = [
        createAuditEvent({
          event: 'review.synced',
          actor: `Diffmint ${normalized.commandSource.toUpperCase()}`,
          target: normalized.traceId,
          detail: `Uploaded ${normalized.summary}`
        }),
        ...state.auditEvents
      ];

      return clone(normalized);
    },
    async (db) => recordReviewSessionPersistent(db, session)
  );
}

export async function recordUsageEvent(
  event: Omit<UsageEvent, 'id' | 'createdAt' | 'workspaceId'> & { workspaceId?: string }
): Promise<UsageEvent> {
  return withPersistence(
    () => {
      const state = getState();
      const normalized: UsageEvent = {
        ...event,
        id: `usage-${randomUUID()}`,
        workspaceId: event.workspaceId ?? state.workspace.id,
        createdAt: new Date().toISOString()
      };

      state.usageEvents = [normalized, ...state.usageEvents];
      return clone(normalized);
    },
    async (db) => createUsageEventPersistent(db, event)
  );
}

export async function registerClientInstallation(
  installation: Omit<ClientInstallation, 'id' | 'lastSeenAt' | 'workspaceId'> & {
    workspaceId?: string;
  }
): Promise<ClientInstallation> {
  return withPersistence(
    () => {
      const state = getState();
      const workspaceId = installation.workspaceId ?? state.workspace.id;
      const existing = state.clientInstallations.find(
        (item) =>
          item.workspaceId === workspaceId &&
          item.clientType === installation.clientType &&
          item.platform === installation.platform &&
          item.channel === installation.channel &&
          item.userId === installation.userId
      );

      const normalized: ClientInstallation = existing
        ? {
            ...existing,
            version: installation.version,
            lastSeenAt: new Date().toISOString()
          }
        : {
            id: `install-${randomUUID()}`,
            workspaceId,
            userId: installation.userId,
            clientType: installation.clientType,
            platform: installation.platform,
            version: installation.version,
            channel: installation.channel,
            lastSeenAt: new Date().toISOString()
          };

      state.clientInstallations = [
        normalized,
        ...state.clientInstallations.filter((item) => item.id !== normalized.id)
      ];

      if (!existing) {
        state.auditEvents = [
          createAuditEvent({
            event: 'client.installation_registered',
            actor: installation.userId ?? `Diffmint ${installation.clientType.toUpperCase()}`,
            target: normalized.id,
            detail: `Registered ${installation.clientType} ${installation.version} on ${installation.platform}.`
          }),
          ...state.auditEvents
        ];
      } else if (existing.version !== installation.version) {
        state.auditEvents = [
          createAuditEvent({
            event: 'client.installation_updated',
            actor: installation.userId ?? `Diffmint ${installation.clientType.toUpperCase()}`,
            target: normalized.id,
            detail: `Updated ${installation.clientType} installation to ${installation.version}.`
          }),
          ...state.auditEvents
        ];
      }

      return clone(normalized);
    },
    async (db) => registerClientInstallationPersistent(db, installation)
  );
}

export async function getDeviceAuthSession(deviceCode: string): Promise<DeviceAuthSession | null> {
  return withPersistence(
    () => {
      const state = getState();
      const session = state.deviceSessions.find((item) => item.deviceCode === deviceCode);

      if (!session) {
        return null;
      }

      if (
        session.status !== 'revoked' &&
        session.status !== 'expired' &&
        isExpiredTimestamp(session.expiresAt)
      ) {
        session.status = 'expired';
      }

      return toPublicDeviceSession(session);
    },
    async (db) => {
      const [row] = await db
        .select()
        .from(deviceAuthSessions)
        .where(eq(deviceAuthSessions.deviceCode, deviceCode))
        .limit(1);

      if (!row) {
        return null;
      }

      if (
        row.status !== 'revoked' &&
        row.status !== 'expired' &&
        isExpiredTimestamp(row.expiresAt)
      ) {
        const [expired] = await db
          .update(deviceAuthSessions)
          .set({
            status: 'expired',
            updatedAt: new Date()
          })
          .where(eq(deviceAuthSessions.id, row.id))
          .returning();

        return mapDeviceSessionFromRow(db, expired);
      }

      return mapDeviceSessionFromRow(db, row);
    }
  );
}

export async function approveDeviceAuth(
  deviceCode: string,
  actorId = 'Diffmint Browser Approval',
  workspaceId?: string
): Promise<DeviceAuthSession | null> {
  return withPersistence(
    () => {
      const state = getState();
      const session = state.deviceSessions.find((item) => item.deviceCode === deviceCode);

      if (!session) {
        return null;
      }

      if (session.status === 'pending' && new Date(session.expiresAt).getTime() <= Date.now()) {
        session.status = 'expired';
        return toPublicDeviceSession(session);
      }

      if (session.status !== 'pending') {
        return toPublicDeviceSession(session);
      }

      if (workspaceId) {
        session.workspaceId = workspaceId;
      }

      session.status = 'approved';
      session.expiresAt = getApprovedDeviceSessionExpiresAt();
      state.usageEvents = [
        {
          id: `usage-${randomUUID()}`,
          workspaceId: session.workspaceId ?? state.workspace.id,
          actorId,
          source: 'cli',
          event: 'auth.login',
          metadata: {
            deviceCode: session.deviceCode
          },
          createdAt: new Date().toISOString()
        },
        ...state.usageEvents
      ];
      state.auditEvents = [
        createAuditEvent({
          event: 'device.auth_approved',
          actor: actorId,
          target: session.deviceCode,
          detail: `Approved device auth for workspace ${session.workspaceId ?? state.workspace.id}.`
        }),
        ...state.auditEvents
      ];

      return toPublicDeviceSession(session);
    },
    async (db) => {
      const [row] = await db
        .select()
        .from(deviceAuthSessions)
        .where(eq(deviceAuthSessions.deviceCode, deviceCode))
        .limit(1);

      if (!row) {
        return null;
      }

      if (row.status === 'pending' && row.expiresAt.getTime() <= Date.now()) {
        const [expired] = await db
          .update(deviceAuthSessions)
          .set({
            status: 'expired',
            updatedAt: new Date()
          })
          .where(eq(deviceAuthSessions.id, row.id))
          .returning();

        return mapDeviceSessionFromRow(db, expired);
      }

      if (row.status !== 'pending') {
        return mapDeviceSessionFromRow(db, row);
      }

      const targetWorkspaceRow = workspaceId ? await getWorkspaceRow(db, workspaceId) : null;
      const [approved] = await db
        .update(deviceAuthSessions)
        .set({
          workspaceId: targetWorkspaceRow?.id ?? row.workspaceId,
          status: 'approved',
          expiresAt: new Date(getApprovedDeviceSessionExpiresAt()),
          updatedAt: new Date()
        })
        .where(eq(deviceAuthSessions.id, row.id))
        .returning();

      const approvedWorkspaceRow =
        targetWorkspaceRow ?? (await getWorkspaceRowByInternalId(db, approved.workspaceId ?? null));
      const externalWorkspaceId = approvedWorkspaceRow
        ? getExternalWorkspaceId(approvedWorkspaceRow)
        : workspaceSeed.id;

      await db.insert(usageEventsTable).values({
        workspaceId: approved.workspaceId ?? (await getWorkspaceRow(db)).id,
        actorId,
        source: 'cli',
        event: 'auth.login',
        creditsDelta: null,
        metadata: {
          deviceCode: approved.deviceCode
        }
      });

      await appendAuditEventPersistent(db, externalWorkspaceId, {
        actorId,
        event: 'device.auth_approved',
        targetType: 'device_auth_session',
        targetId: approved.deviceCode,
        detail: `Approved device auth for workspace ${externalWorkspaceId}.`,
        metadata: {
          targetLabel: approved.deviceCode
        }
      });

      return mapDeviceSessionFromRow(db, approved);
    }
  );
}

export async function authorizeApprovedDeviceSession(
  deviceCode: string
): Promise<{ deviceCode: string; workspaceId: string } | null> {
  return withPersistence(
    () => {
      const state = getState();
      const session = state.deviceSessions.find((item) => item.deviceCode === deviceCode);

      if (!session || session.status !== 'approved') {
        return null;
      }

      if (isExpiredTimestamp(session.expiresAt)) {
        session.status = 'expired';
        return null;
      }

      session.expiresAt = getApprovedDeviceSessionExpiresAt();

      return {
        deviceCode: session.deviceCode,
        workspaceId: session.workspaceId ?? workspaceSeed.id
      };
    },
    async (db) => {
      const [row] = await db
        .select()
        .from(deviceAuthSessions)
        .where(eq(deviceAuthSessions.deviceCode, deviceCode))
        .limit(1);

      if (!row || row.status !== 'approved') {
        return null;
      }

      if (isExpiredTimestamp(row.expiresAt)) {
        await db
          .update(deviceAuthSessions)
          .set({
            status: 'expired',
            updatedAt: new Date()
          })
          .where(eq(deviceAuthSessions.id, row.id));

        return null;
      }

      const nextExpiresAt = new Date(getApprovedDeviceSessionExpiresAt());
      const [authorized] = await db
        .update(deviceAuthSessions)
        .set({
          expiresAt: nextExpiresAt,
          updatedAt: new Date()
        })
        .where(eq(deviceAuthSessions.id, row.id))
        .returning();

      const workspaceRow = await getWorkspaceRowByInternalId(db, authorized.workspaceId ?? null);

      return {
        deviceCode: authorized.deviceCode,
        workspaceId: workspaceRow ? getExternalWorkspaceId(workspaceRow) : workspaceSeed.id
      };
    }
  );
}

export async function startDeviceAuth(
  workspaceId?: string,
  appUrl?: string
): Promise<DeviceAuthSession> {
  return withPersistence(
    () => {
      const state = getState();
      const deviceCode = `device_${randomUUID()}`;
      const userCode = `FLOW-${Math.floor(1000 + Math.random() * 9000)}`;
      const verification = buildDeviceVerificationUri(deviceCode, appUrl);
      const session: StoredDeviceAuthSession = {
        deviceCode,
        userCode,
        verificationUri: verification.verificationUri,
        verificationUriComplete: verification.verificationUriComplete,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        intervalSeconds: 2,
        status: 'pending',
        workspaceId: workspaceId ?? state.workspace.id,
        autoApproveOnPoll: shouldAutoApproveDeviceFlow()
      };

      state.deviceSessions = [session, ...state.deviceSessions];
      return toPublicDeviceSession(session);
    },
    async (db) => {
      const workspaceRow = await getWorkspaceRow(db, workspaceId);
      const deviceCode = `device_${randomUUID()}`;
      const userCode = `FLOW-${Math.floor(1000 + Math.random() * 9000)}`;
      const verification = buildDeviceVerificationUri(deviceCode, appUrl);

      await db.insert(deviceAuthSessions).values({
        workspaceId: workspaceRow.id,
        deviceCode,
        userCode,
        verificationUri: verification.verificationUri,
        verificationUriComplete: verification.verificationUriComplete,
        status: 'pending',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        intervalSeconds: 2
      });

      return {
        deviceCode,
        userCode,
        verificationUri: verification.verificationUri,
        verificationUriComplete: verification.verificationUriComplete,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        intervalSeconds: 2,
        status: 'pending',
        workspaceId: workspaceId ?? getExternalWorkspaceId(workspaceRow)
      };
    }
  );
}

export async function pollDeviceAuth(deviceCode: string): Promise<DeviceAuthSession | null> {
  return withPersistence(
    () => {
      const state = getState();
      const session = state.deviceSessions.find((item) => item.deviceCode === deviceCode);

      if (!session) {
        return null;
      }

      if (session.status === 'revoked' || session.status === 'approved') {
        return toPublicDeviceSession(session);
      }

      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        session.status = 'expired';
        return toPublicDeviceSession(session);
      }

      if (session.autoApproveOnPoll) {
        return approveDeviceAuth(deviceCode, 'Diffmint Control Plane');
      }

      return toPublicDeviceSession(session);
    },
    async (db) => {
      const [row] = await db
        .select()
        .from(deviceAuthSessions)
        .where(eq(deviceAuthSessions.deviceCode, deviceCode))
        .limit(1);

      if (!row) {
        return null;
      }

      const mappedSession = await mapDeviceSessionFromRow(db, row);

      if (row.status === 'approved' || row.status === 'revoked') {
        return mappedSession;
      }

      if (row.expiresAt.getTime() <= Date.now()) {
        const [expired] = await db
          .update(deviceAuthSessions)
          .set({
            status: 'expired',
            updatedAt: new Date()
          })
          .where(eq(deviceAuthSessions.id, row.id))
          .returning();

        return mapDeviceSessionFromRow(db, expired);
      }

      if (shouldAutoApproveDeviceFlow()) {
        return approveDeviceAuth(deviceCode, 'Diffmint Control Plane');
      }

      return mappedSession;
    }
  );
}

export async function revokeDeviceAuth(deviceCode: string): Promise<DeviceAuthSession | null> {
  return withPersistence(
    () => {
      const state = getState();
      const session = state.deviceSessions.find((item) => item.deviceCode === deviceCode);

      if (!session) {
        return null;
      }

      session.status = 'revoked';
      state.auditEvents = [
        createAuditEvent({
          event: 'device.auth_revoked',
          actor: 'Diffmint Control Plane',
          target: session.deviceCode,
          detail: `Revoked device auth for workspace ${session.workspaceId ?? state.workspace.id}.`
        }),
        ...state.auditEvents
      ];

      return toPublicDeviceSession(session);
    },
    async (db) => {
      const [revoked] = await db
        .update(deviceAuthSessions)
        .set({
          status: 'revoked',
          updatedAt: new Date()
        })
        .where(eq(deviceAuthSessions.deviceCode, deviceCode))
        .returning();

      if (!revoked) {
        return null;
      }

      const workspaceRow = await getWorkspaceRowByInternalId(db, revoked.workspaceId ?? null);
      const externalWorkspaceId = workspaceRow
        ? getExternalWorkspaceId(workspaceRow)
        : workspaceSeed.id;

      await appendAuditEventPersistent(db, externalWorkspaceId, {
        actorId: 'Diffmint Control Plane',
        event: 'device.auth_revoked',
        targetType: 'device_auth_session',
        targetId: revoked.deviceCode,
        detail: `Revoked device auth for workspace ${externalWorkspaceId}.`,
        metadata: {
          targetLabel: revoked.deviceCode
        }
      });

      return mapDeviceSessionFromRow(db, revoked);
    }
  );
}

export async function applyPolarWebhookPayload(payload: unknown): Promise<void> {
  const normalizedPayload = payload as PolarWebhookPayload;

  await withPersistence(
    () => {
      updateMemoryBillingState(normalizedPayload);
    },
    async (db) => {
      await applyPolarWebhookPersistent(db, normalizedPayload);
    }
  );
}

export function resetControlPlaneState(): void {
  globalThis.__diffmintControlPlaneState = createSeedState();
}
