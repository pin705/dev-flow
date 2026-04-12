CREATE TYPE "public"."artifact_kind" AS ENUM('markdown', 'json', 'terminal', 'raw-provider-output', 'diagnostic');--> statement-breakpoint
CREATE TYPE "public"."billing_provider" AS ENUM('polar');--> statement-breakpoint
CREATE TYPE "public"."billing_status" AS ENUM('active', 'trialing', 'past_due', 'canceled', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."command_source" AS ENUM('cli', 'vscode', 'web');--> statement-breakpoint
CREATE TYPE "public"."membership_role" AS ENUM('owner', 'admin', 'member', 'billing_admin', 'auditor');--> statement-breakpoint
CREATE TYPE "public"."provider_mode" AS ENUM('managed', 'byok');--> statement-breakpoint
CREATE TYPE "public"."release_channel" AS ENUM('stable', 'preview', 'canary');--> statement-breakpoint
CREATE TYPE "public"."review_source" AS ENUM('local_diff', 'selected_files', 'branch_compare', 'pull_request', 'pasted_diff', 'commit_range');--> statement-breakpoint
CREATE TYPE "public"."review_session_status" AS ENUM('queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"actor_id" varchar(191),
	"event" varchar(128) NOT NULL,
	"target_type" varchar(64) NOT NULL,
	"target_id" varchar(191) NOT NULL,
	"detail" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "billing_provider" DEFAULT 'polar' NOT NULL,
	"customer_id" varchar(191),
	"subscription_id" varchar(191),
	"plan_key" varchar(64) NOT NULL,
	"status" "billing_status" DEFAULT 'inactive' NOT NULL,
	"seats_used" integer DEFAULT 0 NOT NULL,
	"seat_limit" integer DEFAULT 0 NOT NULL,
	"credits_included" integer DEFAULT 0 NOT NULL,
	"credits_remaining" integer DEFAULT 0 NOT NULL,
	"spend_cap_usd" integer DEFAULT 0 NOT NULL,
	"product_ids" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"user_id" varchar(191),
	"client_type" varchar(32) NOT NULL,
	"platform" varchar(64) NOT NULL,
	"version" varchar(64) NOT NULL,
	"channel" "release_channel" DEFAULT 'stable' NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"device_code" varchar(191) NOT NULL,
	"user_code" varchar(32) NOT NULL,
	"verification_uri" varchar(255) NOT NULL,
	"verification_uri_complete" varchar(255),
	"status" varchar(32) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"interval_seconds" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_auth_sessions_device_code_unique" UNIQUE("device_code"),
	CONSTRAINT "device_auth_sessions_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" varchar(191) NOT NULL,
	"role" "membership_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" varchar(191) NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"policy_set_id" uuid NOT NULL,
	"version" varchar(64) NOT NULL,
	"checksum" varchar(191) NOT NULL,
	"checklist" jsonb NOT NULL,
	"rules" jsonb NOT NULL,
	"published_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" varchar(64) NOT NULL,
	"mode" "provider_mode" NOT NULL,
	"default_model" varchar(128) NOT NULL,
	"allowed_models" jsonb NOT NULL,
	"fallback_provider" varchar(128),
	"rate_limit_per_minute" integer,
	"encrypted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" "release_channel" NOT NULL,
	"version" varchar(64) NOT NULL,
	"cli_manifest" jsonb NOT NULL,
	"vscode_manifest" jsonb NOT NULL,
	"notes_url" varchar(255),
	"released_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"review_session_id" uuid NOT NULL,
	"kind" "artifact_kind" NOT NULL,
	"label" varchar(191) NOT NULL,
	"mime_type" varchar(191) NOT NULL,
	"content" text,
	"storage_key" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid,
	"request_id" varchar(191) NOT NULL,
	"trace_id" varchar(191) NOT NULL,
	"source" "review_source" NOT NULL,
	"command_source" "command_source" NOT NULL,
	"provider" varchar(64),
	"model" varchar(128),
	"policy_version_id" uuid,
	"status" "review_session_status" NOT NULL,
	"summary" text NOT NULL,
	"severity_counts" jsonb NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_sessions_trace_id_unique" UNIQUE("trace_id")
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" varchar(191),
	"source" "command_source" NOT NULL,
	"event" varchar(128) NOT NULL,
	"credits_delta" integer,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_organization_id" varchar(191),
	"slug" varchar(191) NOT NULL,
	"name" varchar(191) NOT NULL,
	"cloud_sync_enabled" boolean DEFAULT true NOT NULL,
	"local_only_default" boolean DEFAULT false NOT NULL,
	"redaction_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_clerk_organization_id_unique" UNIQUE("clerk_organization_id"),
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_installations" ADD CONSTRAINT "client_installations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_auth_sessions" ADD CONSTRAINT "device_auth_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_sets" ADD CONSTRAINT "policy_sets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_set_id_policy_sets_id_fk" FOREIGN KEY ("policy_set_id") REFERENCES "public"."policy_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_artifacts" ADD CONSTRAINT "review_artifacts_review_session_id_review_sessions_id_fk" FOREIGN KEY ("review_session_id") REFERENCES "public"."review_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;