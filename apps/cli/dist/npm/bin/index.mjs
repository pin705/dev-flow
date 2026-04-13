#!/usr/bin/env node

// src/index.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { randomUUID as randomUUID2 } from "node:crypto";
import { existsSync as existsSync3, mkdirSync, readFileSync as readFileSync3, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path4 from "node:path";

// ../../packages/review-core/src/index.ts
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync as existsSync2, mkdtempSync, readFileSync as readFileSync2, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path2 from "node:path";

// ../../packages/review-core/src/context.ts
var MAX_VISIBLE_FILES = 5;
var MAX_PROMPT_FILES = 8;
var MAX_FILE_GROUPS = 6;
function humanizeSource(source) {
  return source.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}
function getFileGroupLabel(filePath) {
  const segments = filePath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "root";
  }
  if ((segments[0] === "apps" || segments[0] === "packages") && segments.length > 1) {
    return `${segments[0]}/${segments[1]}`;
  }
  return segments[0];
}
function sortFileGroups(groups) {
  return [...groups].sort((left, right) => {
    if (right.count !== left.count) {
      return right.count - left.count;
    }
    return left.label.localeCompare(right.label);
  });
}
function buildFileGroups(files, maxFileGroups = MAX_FILE_GROUPS) {
  const counts = /* @__PURE__ */ new Map();
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
function buildDiffStats(diff, fileCount) {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      additions += 1;
      continue;
    }
    if (line.startsWith("-")) {
      deletions += 1;
    }
  }
  return {
    fileCount,
    additions,
    deletions
  };
}
function buildFileSummary(files, groups) {
  if (files.length === 0) {
    return "Auto-detected from diff.";
  }
  if (files.length === 1) {
    return files[0];
  }
  const groupSummary = groups.map((group) => `${group.label} (${group.count})`).join(", ");
  return `${files.length} files across ${groupSummary || "the current diff"}.`;
}
function formatVisibleFiles(files, maxVisible = MAX_VISIBLE_FILES) {
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
function resolveContextLimits(convention, options) {
  return {
    maxVisibleFiles: options.maxVisibleFiles ?? convention?.maxVisibleFiles ?? MAX_VISIBLE_FILES,
    maxFileGroups: options.maxFileGroups ?? convention?.maxFileGroups ?? MAX_FILE_GROUPS
  };
}
function buildReviewContextSummary(request, options = {}) {
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
function formatFileGroupSummary(groups) {
  if (groups.length === 0) {
    return "No file groups detected.";
  }
  return groups.map((group) => `${group.label} (${group.count})`).join(", ");
}
function buildRecommendedNextSteps(findings, context) {
  const nextSteps = [];
  const highestSeverity = findings.some(
    (finding) => finding.severity === "critical" || finding.severity === "high"
  );
  const mentionsTests = findings.some(
    (finding) => finding.title.toLowerCase().includes("test") || finding.summary.toLowerCase().includes("test")
  );
  if (highestSeverity) {
    nextSteps.push("Run a security-oriented verification pass before merge.");
  }
  if (mentionsTests) {
    nextSteps.push("Add automated coverage or document manual verification for the changed scope.");
  }
  if (context.remainingFileCount > 0) {
    nextSteps.push("Open the full report or history view to inspect the remaining grouped files.");
  }
  if (nextSteps.length === 0 && findings.length > 0) {
    nextSteps.push("Capture the validation plan and resolve the highest-signal findings first.");
  }
  if (nextSteps.length === 0) {
    nextSteps.push("Record the review result and any manual checks before merge.");
  }
  return nextSteps;
}
function formatPromptVisibleFiles(context) {
  if (context.visibleFiles.length === 0) {
    return "Auto-detected from diff.";
  }
  const visible = context.visibleFiles.length > MAX_PROMPT_FILES ? context.visibleFiles.slice(0, MAX_PROMPT_FILES) : context.visibleFiles;
  const remaining = context.remainingFileCount + Math.max(context.visibleFiles.length - visible.length, 0);
  return remaining > 0 ? `${visible.join(", ")} (+${remaining} more)` : visible.join(", ");
}
function buildHeadlessReviewPrompt(request, policy) {
  const context = request.metadata.context ?? buildReviewContextSummary(request);
  const convention = request.metadata.convention;
  const instructions = [
    "Role",
    "You are Diffmint, a policy-driven code review runtime.",
    "",
    "Priorities",
    "- Focus on concrete bugs, regressions, security issues, missing tests, and policy violations.",
    "- Collapse repetitive observations into a single higher-signal finding.",
    "- Ignore style-only nits unless they create real risk or confusion.",
    "",
    "Review Context",
    `- Prompt profile: ${request.promptProfile ?? "diffmint-codex-compact-v1"}.`,
    `- Review mode: ${request.mode}.`,
    `- Review source: ${context.sourceLabel}.`,
    `- Branch: ${context.branch ?? "unknown"}.`,
    `- Scope summary: ${context.fileSummary}`,
    `- File groups: ${formatFileGroupSummary(context.fileGroups)}.`,
    `- Visible files: ${formatPromptVisibleFiles(context)}.`,
    `- Diff summary: ${context.diffStats.fileCount} file(s), +${context.diffStats.additions}/-${context.diffStats.deletions}.`,
    "",
    "Policy Context"
  ];
  if (convention?.additionalPriorities.length) {
    instructions.push("", "Team Priorities");
    instructions.push(...convention.additionalPriorities.map((item) => `- ${item}`));
  }
  if (convention?.reviewNotes.length) {
    instructions.push("", "Review Notes");
    instructions.push(...convention.reviewNotes.map((item) => `- ${item}`));
  }
  if (policy) {
    instructions.push(`- Active policy version: ${policy.policyVersionId}.`);
    instructions.push(`- Policy summary: ${policy.summary}`);
    if (policy.checklist.length > 0) {
      instructions.push(
        `- Required checklist: ${policy.checklist.filter((item) => item.required).slice(0, 4).map((item) => item.title).join(", ")}.`
      );
    }
  } else {
    instructions.push("- No policy bundle was provided.");
  }
  instructions.push(
    "",
    "Output Contract",
    "- Return valid JSON only.",
    "- Use this shape exactly:",
    '{"summary":"string","findings":[{"severity":"low|medium|high|critical","title":"string","summary":"string","filePath":"optional string","line":"optional number","excerpt":"optional string","suggestedAction":"optional string"}]}',
    "- Prefer 0-5 findings, ordered by risk."
  );
  return instructions.join("\n");
}

// ../../packages/review-core/src/conventions.ts
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
var DEFAULT_REVIEW_CONVENTION = {
  promptProfile: "diffmint-codex-compact-v1",
  source: "default",
  additionalPriorities: [],
  reviewNotes: [],
  snippetContextLines: 2,
  maxVisibleFiles: 5,
  maxFileGroups: 6
};
function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function toPositiveInteger(value, fallback) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}
function getReviewConventionPath(cwd) {
  return path.join(cwd, ".diffmint", "review-conventions.json");
}
function inspectReviewConvention(cwd) {
  const conventionPath = getReviewConventionPath(cwd);
  if (!existsSync(conventionPath)) {
    return {
      convention: DEFAULT_REVIEW_CONVENTION,
      status: "default",
      detail: "Using built-in Diffmint review conventions."
    };
  }
  try {
    const parsed = JSON.parse(readFileSync(conventionPath, "utf8"));
    const convention = {
      promptProfile: typeof parsed.promptProfile === "string" && parsed.promptProfile.trim().length > 0 ? parsed.promptProfile.trim() : DEFAULT_REVIEW_CONVENTION.promptProfile,
      source: "workspace-file",
      filePath: conventionPath,
      additionalPriorities: isStringArray(parsed.additionalPriorities) ? parsed.additionalPriorities.filter(Boolean) : [],
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
      status: "loaded",
      detail: `Loaded workspace review conventions from ${conventionPath}.`
    };
  } catch (error) {
    return {
      convention: DEFAULT_REVIEW_CONVENTION,
      status: "invalid",
      detail: error instanceof Error ? `Invalid review convention file at ${conventionPath}: ${error.message}` : `Invalid review convention file at ${conventionPath}.`
    };
  }
}
function resolveReviewConvention(cwd) {
  return inspectReviewConvention(cwd).convention;
}

// ../../packages/review-core/src/render.ts
function countSeverity(findings, severity) {
  return findings.filter((finding) => finding.severity === severity).length;
}
function renderSeveritySummary(findings) {
  return [
    `Critical ${countSeverity(findings, "critical")}`,
    `High ${countSeverity(findings, "high")}`,
    `Medium ${countSeverity(findings, "medium")}`,
    `Low ${countSeverity(findings, "low")}`
  ].join(" | ");
}
function formatFindingLocation(finding) {
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
function renderTerminalExcerpt(finding) {
  if (!finding.excerpt) {
    return [];
  }
  return ["     Code:", ...finding.excerpt.split("\n").map((line) => `       ${line}`)];
}
function renderContextLines(context) {
  const lines = [
    `  Files: ${context.fileSummary}`,
    `  File groups: ${formatFileGroupSummary(context.fileGroups)}`,
    `  Diff summary: ${context.diffStats.fileCount} file(s), +${context.diffStats.additions}/-${context.diffStats.deletions}`
  ];
  if (context.visibleFiles.length > 0) {
    const visible = context.remainingFileCount > 0 ? `${context.visibleFiles.join(", ")} (+${context.remainingFileCount} more)` : context.visibleFiles.join(", ");
    lines.push(`  Visible files: ${visible}`);
  }
  return lines;
}
function renderFindingLines(findings) {
  if (findings.length === 0) {
    return ["  No actionable findings detected."];
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
function renderNextSteps(context, findings) {
  return buildRecommendedNextSteps(findings, context).map((step) => `  - ${step}`);
}
function renderTerminalSession(request, findings) {
  const context = request.metadata.context ?? buildReviewContextSummary(request);
  const lines = [
    "Diffmint Review",
    "===============",
    "",
    "Overview",
    `  Trace ID: ${request.traceId}`,
    `  Source: ${context.sourceLabel}`,
    `  Mode: ${context.modeLabel}`,
    `  Branch: ${context.branch ?? "unknown"}`,
    `  Prompt profile: ${context.promptProfile ?? request.promptProfile ?? "diffmint-codex-compact-v1"}`
  ];
  if (request.metadata.provider) {
    lines.push(`  Provider: ${request.metadata.provider}`);
  }
  if (request.metadata.model) {
    lines.push(`  Model: ${request.metadata.model}`);
  }
  lines.push(
    "",
    "Context",
    ...renderContextLines(context),
    "",
    "Severity Summary",
    `  ${renderSeveritySummary(findings)}`,
    "",
    "Findings",
    ...renderFindingLines(findings),
    "",
    "Next Steps",
    ...renderNextSteps(context, findings)
  );
  return lines.join("\n");
}
function renderMarkdownFinding(findings) {
  if (findings.length === 0) {
    return "- No findings";
  }
  return findings.map((finding, index) => {
    const lines = [`${index + 1}. **${finding.severity.toUpperCase()}** ${finding.title}`];
    const location = formatFindingLocation(finding);
    if (location) {
      lines.push(`   - File: \`${location}\``);
    }
    lines.push(`   - Why: ${finding.summary}`);
    if (finding.excerpt) {
      lines.push("   - Code:");
      lines.push("```text");
      lines.push(finding.excerpt);
      lines.push("```");
    }
    if (finding.suggestedAction) {
      lines.push(`   - Next: ${finding.suggestedAction}`);
    }
    return lines.join("\n");
  }).join("\n");
}
function renderMarkdownContext(context) {
  if (!context) {
    return "- Context metadata unavailable.";
  }
  const lines = [
    `- Source: \`${context.sourceLabel}\``,
    `- Mode: \`${context.modeLabel}\``,
    `- Branch: \`${context.branch ?? "unknown"}\``,
    `- Prompt profile: \`${context.promptProfile ?? "diffmint-codex-compact-v1"}\``,
    `- Files: ${context.fileSummary}`,
    `- File groups: ${formatFileGroupSummary(context.fileGroups)}`,
    `- Diff summary: ${context.diffStats.fileCount} file(s), +${context.diffStats.additions}/-${context.diffStats.deletions}`
  ];
  if (context.visibleFiles.length > 0) {
    const visible = context.remainingFileCount > 0 ? `${context.visibleFiles.join(", ")} (+${context.remainingFileCount} more)` : context.visibleFiles.join(", ");
    lines.push(`- Visible files: ${visible}`);
  }
  return lines.join("\n");
}
function renderMarkdownNextSteps(context, findings) {
  if (!context) {
    return "- Record the review result and any manual checks before merge.";
  }
  return buildRecommendedNextSteps(findings, context).map((step) => `- ${step}`).join("\n");
}
function renderMarkdownSession(session) {
  return [
    "# Diffmint Review",
    "",
    "## Overview",
    `- Trace ID: \`${session.traceId}\``,
    `- Status: \`${session.status}\``,
    `- Provider: \`${session.provider}\``,
    `- Model: \`${session.model}\``,
    `- Summary: ${session.summary}`,
    "",
    "## Context",
    renderMarkdownContext(session.context),
    "",
    "## Severity Summary",
    `- Critical: ${session.severityCounts.critical}`,
    `- High: ${session.severityCounts.high}`,
    `- Medium: ${session.severityCounts.medium}`,
    `- Low: ${session.severityCounts.low}`,
    "",
    "## Findings",
    renderMarkdownFinding(session.findings),
    "",
    "## Next Steps",
    renderMarkdownNextSteps(session.context, session.findings),
    ""
  ].join("\n");
}

// ../../packages/review-core/src/index.ts
function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  }).trim();
}
function tryRun(command, args, cwd) {
  try {
    return run(command, args, cwd);
  } catch {
    return null;
  }
}
function buildGitDiffArgs({
  baseRef,
  files,
  staged
}) {
  const args = ["diff"];
  if (staged) {
    args.push("--staged");
  }
  if (baseRef) {
    args.push(`${baseRef}...HEAD`);
  }
  args.push("--");
  if (files && files.length > 0) {
    args.push(...files);
  }
  return args;
}
function isUntrackedFile(cwd, filePath) {
  const status = tryRun("git", ["status", "--porcelain", "--", filePath], cwd);
  return status?.trim().startsWith("??") ?? false;
}
function escapeDiffPath(filePath) {
  return filePath.replace(/\\/g, "/");
}
function buildUntrackedFileDiff(cwd, filePath) {
  const absolutePath = path2.join(cwd, filePath);
  if (!existsSync2(absolutePath)) {
    return "";
  }
  const normalizedPath = escapeDiffPath(filePath);
  const content = readFileSync2(absolutePath, "utf8");
  const contentLines = content.split("\n");
  const lines = content.endsWith("\n") ? contentLines.slice(0, -1) : contentLines;
  const diff = [
    `diff --git a/${normalizedPath} b/${normalizedPath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${normalizedPath}`
  ];
  if (lines.length > 0) {
    diff.push(`@@ -0,0 +1,${lines.length} @@`);
    diff.push(...lines.map((line) => `+${line}`));
  }
  return diff.join("\n");
}
function createTraceId() {
  return randomUUID();
}
function collectGitDiff(options) {
  const diff = tryRun("git", buildGitDiffArgs(options), options.cwd) ?? "";
  const files = options.files ?? [];
  if (files.length === 0) {
    return diff;
  }
  const changedFiles = new Set(detectChangedFiles(diff));
  const syntheticDiffs = files.filter((file) => !changedFiles.has(file) && isUntrackedFile(options.cwd, file)).map((file) => buildUntrackedFileDiff(options.cwd, file)).filter(Boolean);
  if (syntheticDiffs.length === 0) {
    return diff;
  }
  return [diff, ...syntheticDiffs].filter(Boolean).join("\n");
}
function getCurrentBranch(cwd) {
  return tryRun("git", ["rev-parse", "--abbrev-ref", "HEAD"], cwd) ?? void 0;
}
function detectChangedFiles(diff) {
  const fileMatches = diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm);
  const files = /* @__PURE__ */ new Set();
  for (const match of fileMatches) {
    files.add(match[2]);
  }
  return [...files];
}
function normalizeReviewFilePath(cwd, filePath) {
  const normalizedPath = filePath.replace(/\\/g, "/");
  if (!path2.isAbsolute(normalizedPath)) {
    return normalizedPath.replace(/^\.\//, "");
  }
  const relativePath = path2.relative(cwd, normalizedPath).replace(/\\/g, "/");
  return relativePath.startsWith("..") ? normalizedPath : relativePath.replace(/^\.\//, "");
}
function normalizeReviewFiles(cwd, files) {
  if (!files || files.length === 0) {
    return [];
  }
  return [...new Set(files.map((file) => normalizeReviewFilePath(cwd, file)))];
}
function parseDiffFiles(diff) {
  const parsed = /* @__PURE__ */ new Map();
  let currentFile = null;
  let currentLine = 0;
  let inHunk = false;
  for (const line of diff.split("\n")) {
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffMatch) {
      currentFile = diffMatch[2];
      parsed.set(currentFile, {
        addedLines: []
      });
      inHunk = false;
      continue;
    }
    if (!currentFile) {
      continue;
    }
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = Number(hunkMatch[1] ?? "0");
      inHunk = true;
      const fileState = parsed.get(currentFile);
      if (fileState && fileState.firstLine === void 0) {
        fileState.firstLine = currentLine;
      }
      continue;
    }
    if (!inHunk || line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    if (line.startsWith("+")) {
      parsed.get(currentFile)?.addedLines.push({
        line: currentLine,
        text: line.slice(1)
      });
      currentLine += 1;
      continue;
    }
    if (line.startsWith("-")) {
      continue;
    }
    if (line.startsWith(" ")) {
      currentLine += 1;
    }
  }
  return parsed;
}
function resolveFindingLine(fileDiff) {
  return fileDiff?.addedLines[0]?.line ?? fileDiff?.firstLine;
}
function buildExcerptFromFile(cwd, filePath, line, convention) {
  if (!line) {
    return void 0;
  }
  const absolutePath = path2.isAbsolute(filePath) ? filePath : path2.join(cwd, filePath);
  if (!existsSync2(absolutePath)) {
    return void 0;
  }
  const contextLines = convention?.snippetContextLines ?? 2;
  const fileLines = readFileSync2(absolutePath, "utf8").split("\n");
  const start = Math.max(line - contextLines - 1, 0);
  const end = Math.min(line + contextLines, fileLines.length);
  return fileLines.slice(start, end).join("\n").trimEnd() || void 0;
}
function buildExcerptFromDiff(fileDiff) {
  if (!fileDiff || fileDiff.addedLines.length === 0) {
    return void 0;
  }
  return fileDiff.addedLines.slice(0, 5).map((entry) => entry.text).join("\n").trimEnd();
}
function enrichFindingLocation(finding, request, diffFiles) {
  if (!finding.filePath) {
    return finding;
  }
  const normalizedFilePath = normalizeReviewFilePath(request.metadata.cwd, finding.filePath);
  const fileDiff = diffFiles.get(normalizedFilePath);
  const line = finding.line ?? resolveFindingLine(fileDiff);
  const excerpt = finding.excerpt ?? buildExcerptFromFile(
    request.metadata.cwd,
    normalizedFilePath,
    line,
    request.metadata.convention
  ) ?? buildExcerptFromDiff(fileDiff);
  return {
    ...finding,
    filePath: normalizedFilePath,
    line,
    endLine: finding.endLine ?? line,
    excerpt
  };
}
function countSeverity2(findings, severity) {
  return findings.filter((item) => item.severity === severity).length;
}
function redactSensitiveText(value) {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  return value.replace(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g,
    "[REDACTED PRIVATE KEY]"
  ).replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*\b/gi, "Bearer [REDACTED]").replace(/\b(?:sk|pk|rk)_[A-Za-z0-9_-]{16,}\b/g, "[REDACTED API KEY]").replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED API KEY]").replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "[REDACTED GITHUB TOKEN]").replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, "[REDACTED GITHUB TOKEN]").replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED AWS ACCESS KEY]").replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, "[REDACTED GOOGLE API KEY]").replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, "[REDACTED SLACK TOKEN]").replace(
    /((?:token|secret|password|passphrase|api[_-]?key|access[_-]?key|client[_-]?secret)\s*[:=]\s*)(['"]?)([^'"\s]+)\2/gi,
    (_match, prefix, quote) => `${prefix}${quote}[REDACTED]${quote}`
  );
}
function sanitizeArtifactForCloudSync(artifact, options) {
  if (options.omitRawProviderOutput && artifact.kind === "raw-provider-output") {
    return {
      ...artifact,
      mimeType: "text/plain",
      content: "[REDACTED raw provider output omitted from cloud sync]",
      storageKey: void 0
    };
  }
  return {
    ...artifact,
    content: options.redactText ? redactSensitiveText(artifact.content) : artifact.content,
    storageKey: options.redactText ? redactSensitiveText(artifact.storageKey) : artifact.storageKey
  };
}
function createFinding(options) {
  return {
    id: randomUUID(),
    severity: options.severity,
    title: options.title,
    summary: options.summary,
    filePath: options.filePath,
    line: options.line,
    endLine: options.endLine,
    excerpt: options.excerpt,
    suggestedAction: options.suggestedAction
  };
}
function buildReviewRequest(options) {
  const convention = resolveReviewConvention(options.cwd);
  const normalizedFiles = normalizeReviewFiles(options.cwd, options.files);
  const diff = collectGitDiff({
    ...options,
    files: normalizedFiles
  });
  const files = normalizedFiles.length > 0 ? normalizedFiles : detectChangedFiles(diff);
  const promptProfile = convention.promptProfile;
  const baseRequest = {
    id: randomUUID(),
    traceId: createTraceId(),
    source: options.source,
    commandSource: "cli",
    mode: options.mode ?? "full",
    outputFormat: options.outputFormat ?? "terminal",
    baseRef: options.baseRef,
    files,
    diff,
    promptProfile,
    policyVersionId: options.policy?.policyVersionId,
    localOnly: options.localOnly ?? false,
    cloudSyncEnabled: options.cloudSyncEnabled ?? true,
    metadata: {
      cwd: options.cwd,
      gitBranch: getCurrentBranch(options.cwd),
      provider: options.provider,
      model: options.model,
      convention
    },
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  return {
    ...baseRequest,
    metadata: {
      ...baseRequest.metadata,
      context: buildReviewContextSummary(baseRequest, {
        maxVisibleFiles: convention.maxVisibleFiles,
        maxFileGroups: convention.maxFileGroups
      })
    }
  };
}
function findBinary(cwd, candidates) {
  for (const candidate of candidates) {
    if (tryRun(candidate, ["--version"], cwd)) {
      return candidate;
    }
  }
  return null;
}
function findQwenBinary(cwd) {
  return findBinary(cwd, ["qwen", "qwen-code", "qwen-code-cli"]);
}
function findCodexBinary(cwd) {
  return findBinary(cwd, ["codex"]);
}
function detectLocalApiKeySource() {
  const candidates = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "QWEN_API_KEY", "DASHSCOPE_API_KEY"];
  for (const candidate of candidates) {
    if (process.env[candidate]?.trim()) {
      return candidate;
    }
  }
  return null;
}
function hasCodexAuthConfig(cwd) {
  const loginStatus = tryRun("codex", ["login", "status"], cwd);
  return Boolean(loginStatus && loginStatus.toLowerCase().startsWith("logged in"));
}
function hasHeadlessAuthConfig() {
  return Boolean(detectLocalApiKeySource());
}
function shouldUseCodexRuntime(cwd, provider) {
  const forcedMode = process.env.DIFFMINT_REVIEW_RUNTIME;
  if (forcedMode === "scaffold" || forcedMode === "qwen") {
    return false;
  }
  if (forcedMode === "codex") {
    return Boolean(findCodexBinary(cwd) && hasCodexAuthConfig(cwd));
  }
  return provider === "codex" && Boolean(findCodexBinary(cwd) && hasCodexAuthConfig(cwd));
}
function shouldUseQwenRuntime(cwd, provider) {
  const forcedMode = process.env.DIFFMINT_REVIEW_RUNTIME;
  if (forcedMode === "scaffold") {
    return false;
  }
  if (forcedMode === "codex") {
    return false;
  }
  if (forcedMode === "qwen") {
    return Boolean(findQwenBinary(cwd));
  }
  return Boolean(provider?.startsWith("qwen") && findQwenBinary(cwd) && hasHeadlessAuthConfig());
}
function extractAssistantTextFromQwenPayload(payload) {
  if (!Array.isArray(payload)) {
    return null;
  }
  for (let index = payload.length - 1; index >= 0; index -= 1) {
    const item = payload[index];
    if (item && typeof item === "object" && "type" in item && item.type === "result" && typeof item.result === "string") {
      return item.result;
    }
    if (item && typeof item === "object" && "type" in item && item.type === "assistant") {
      const message = item.message;
      const textParts = message?.content?.filter(
        (contentPart) => contentPart.type === "text" && typeof contentPart.text === "string"
      ).map((contentPart) => contentPart.text) ?? [];
      if (textParts.length > 0) {
        return textParts.join("\n");
      }
    }
  }
  return null;
}
function extractJsonObject(raw) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const directStart = trimmed.indexOf("{");
  const directEnd = trimmed.lastIndexOf("}");
  if (directStart !== -1 && directEnd !== -1 && directEnd > directStart) {
    return trimmed.slice(directStart, directEnd + 1);
  }
  return null;
}
function normalizeFindingFromQwen(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value;
  const severity = candidate.severity;
  const title = candidate.title;
  const summary = candidate.summary;
  if (severity !== "low" && severity !== "medium" && severity !== "high" && severity !== "critical") {
    return null;
  }
  if (typeof title !== "string" || typeof summary !== "string") {
    return null;
  }
  return {
    id: randomUUID(),
    severity,
    title,
    summary,
    filePath: typeof candidate.filePath === "string" ? candidate.filePath : void 0,
    line: typeof candidate.line === "number" ? candidate.line : void 0,
    endLine: typeof candidate.endLine === "number" ? candidate.endLine : void 0,
    excerpt: typeof candidate.excerpt === "string" ? candidate.excerpt : void 0,
    suggestedAction: typeof candidate.suggestedAction === "string" ? candidate.suggestedAction : void 0
  };
}
function parseStructuredReviewText(rawText, rawOutput, options) {
  const embeddedJson = extractJsonObject(rawText);
  if (!embeddedJson) {
    const summary2 = rawText.trim();
    if (!summary2) {
      return null;
    }
    return {
      findings: [],
      summary: `${options.nonJsonSummaryPrefix} ${summary2}`.trim(),
      durationMs: 1e3,
      rawOutput,
      artifactLabel: options.artifactLabel
    };
  }
  const reviewPayload = JSON.parse(embeddedJson);
  const findings = reviewPayload.findings?.map((finding) => normalizeFindingFromQwen(finding)).filter((finding) => Boolean(finding)) ?? [];
  const summary = typeof reviewPayload.summary === "string" && reviewPayload.summary.trim().length > 0 ? reviewPayload.summary.trim() : findings.length === 0 ? options.emptySummary : `${options.nonJsonSummaryPrefix} ${findings.length} structured findings.`.trim();
  return {
    findings,
    summary,
    durationMs: 1e3,
    rawOutput,
    artifactLabel: options.artifactLabel
  };
}
function parseQwenHeadlessOutput(rawOutput) {
  try {
    const payload = JSON.parse(rawOutput);
    const assistantText = extractAssistantTextFromQwenPayload(payload);
    if (!assistantText) {
      return null;
    }
    return parseStructuredReviewText(assistantText, rawOutput, {
      emptySummary: "Qwen completed the headless review with no structured findings.",
      nonJsonSummaryPrefix: "Qwen completed the headless review with",
      artifactLabel: "Qwen Headless Output"
    });
  } catch {
    return null;
  }
}
function parseCodexHeadlessOutput(rawOutput) {
  return parseStructuredReviewText(rawOutput, rawOutput, {
    emptySummary: "Codex completed the headless review with no structured findings.",
    nonJsonSummaryPrefix: "Codex completed the headless review with",
    artifactLabel: "Codex Exec Output"
  });
}
function runQwenHeadlessReview(request, options) {
  const cwd = options.cwd ?? request.metadata.cwd;
  const qwenBinary = findQwenBinary(cwd);
  if (!qwenBinary) {
    return null;
  }
  const startedAt = Date.now();
  try {
    const output2 = execFileSync(
      qwenBinary,
      [
        "--prompt",
        buildHeadlessReviewPrompt(request, options.policy),
        "--output-format",
        "json",
        "--model",
        options.model ?? request.metadata.model ?? "qwen-code"
      ],
      {
        cwd,
        encoding: "utf8",
        input: request.diff,
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
    const parsed = parseQwenHeadlessOutput(output2);
    if (!parsed) {
      return null;
    }
    return {
      ...parsed,
      durationMs: Math.max(Date.now() - startedAt, 1)
    };
  } catch {
    return null;
  }
}
function runCodexHeadlessReview(request, options) {
  const cwd = options.cwd ?? request.metadata.cwd;
  const codexBinary = findCodexBinary(cwd);
  if (!codexBinary || !hasCodexAuthConfig(cwd)) {
    return null;
  }
  const outputDir = mkdtempSync(path2.join(tmpdir(), "diffmint-codex-"));
  const lastMessagePath = path2.join(outputDir, "last-message.txt");
  const startedAt = Date.now();
  try {
    execFileSync(
      codexBinary,
      [
        "exec",
        "--skip-git-repo-check",
        "--color",
        "never",
        "--output-last-message",
        lastMessagePath,
        ...options.model ?? request.metadata.model ? ["--model", options.model ?? request.metadata.model ?? "gpt-5-codex"] : [],
        "-"
      ],
      {
        cwd,
        encoding: "utf8",
        input: buildHeadlessReviewPrompt(request, options.policy),
        stdio: ["pipe", "pipe", "pipe"]
      }
    );
    if (!existsSync2(lastMessagePath)) {
      return null;
    }
    const parsed = parseCodexHeadlessOutput(readFileSync2(lastMessagePath, "utf8"));
    if (!parsed) {
      return null;
    }
    return {
      ...parsed,
      durationMs: Math.max(Date.now() - startedAt, 1)
    };
  } catch {
    return null;
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}
function createFindingsFromRequest(request) {
  const findings = [];
  const diffFiles = parseDiffFiles(request.diff);
  const primaryFile = request.files[0];
  const primaryLine = primaryFile ? resolveFindingLine(diffFiles.get(primaryFile)) : void 0;
  const primaryExcerpt = primaryFile && primaryLine ? buildExcerptFromFile(
    request.metadata.cwd,
    primaryFile,
    primaryLine,
    request.metadata.convention
  ) : void 0;
  if (!request.diff.trim()) {
    findings.push(
      createFinding({
        severity: "low",
        title: "No local changes detected",
        summary: "The requested review scope did not produce a git diff. Confirm the target files, base ref, or staged state before rerunning."
      })
    );
    return findings;
  }
  const files = request.files;
  for (const file of files) {
    if (file.includes("/api/") || file.endsWith("route.ts") || file.includes("billing") || file.includes("auth")) {
      findings.push(
        createFinding({
          severity: "high",
          title: "Sensitive control-plane surface changed",
          summary: `Changes in ${file} affect auth, billing, or API behavior. Run a security-oriented pass and capture verification steps before merge.`,
          filePath: file,
          suggestedAction: "Rerun with `dm review --base origin/main --mode security` and document the verification plan."
        })
      );
    }
    if (file.includes("policy") || file.includes("docs")) {
      findings.push(
        createFinding({
          severity: "medium",
          title: "Governance content changed",
          summary: `Updates in ${file} should stay aligned with the active workspace policy version and release notes.`,
          filePath: file,
          suggestedAction: "Confirm the policy version, changelog entry, and related docs links are updated together."
        })
      );
    }
  }
  const hasTests = files.some((file) => file.includes("test") || file.includes("__tests__"));
  if (!hasTests) {
    findings.push(
      createFinding({
        severity: "medium",
        title: "No test changes found",
        summary: "The diff does not appear to include automated test coverage. Confirm whether the change is low-risk or document manual verification.",
        filePath: primaryFile,
        line: primaryLine,
        endLine: primaryLine,
        excerpt: primaryExcerpt
      })
    );
  }
  return findings.map((finding) => enrichFindingLocation(finding, request, diffFiles));
}
function createReviewSession(request) {
  const findings = createFindingsFromRequest(request);
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const completedAt = (/* @__PURE__ */ new Date()).toISOString();
  const context = request.metadata.context ?? buildReviewContextSummary(request);
  return {
    id: randomUUID(),
    traceId: request.traceId,
    requestId: request.id,
    source: request.source,
    commandSource: request.commandSource,
    provider: request.metadata.provider ?? "qwen",
    model: request.metadata.model ?? "qwen-code",
    policyVersionId: request.policyVersionId,
    status: "completed",
    findings,
    context,
    convention: request.metadata.convention,
    summary: findings.length === 0 ? "No obvious issues detected in the selected review scope." : `Generated ${findings.length} review findings for ${context.fileSummary.toLowerCase()}.`,
    severityCounts: {
      low: countSeverity2(findings, "low"),
      medium: countSeverity2(findings, "medium"),
      high: countSeverity2(findings, "high"),
      critical: countSeverity2(findings, "critical")
    },
    durationMs: 250,
    startedAt,
    completedAt,
    artifacts: [
      {
        id: randomUUID(),
        kind: "terminal",
        label: "Terminal Summary",
        mimeType: "text/plain",
        content: renderTerminalSession(request, findings)
      }
    ]
  };
}
async function createReviewSessionWithRuntime(request, options = {}) {
  const cwd = options.cwd ?? request.metadata.cwd;
  const requestedProvider = options.provider ?? request.metadata.provider;
  if (shouldUseCodexRuntime(cwd, requestedProvider)) {
    const runtimeResult2 = runCodexHeadlessReview(request, options);
    if (runtimeResult2) {
      const diffFiles2 = parseDiffFiles(request.diff);
      const findings2 = runtimeResult2.findings.map(
        (finding) => enrichFindingLocation(finding, request, diffFiles2)
      );
      const startedAt2 = (/* @__PURE__ */ new Date()).toISOString();
      const completedAt2 = (/* @__PURE__ */ new Date()).toISOString();
      const context2 = request.metadata.context ?? buildReviewContextSummary(request);
      return {
        id: randomUUID(),
        traceId: request.traceId,
        requestId: request.id,
        source: request.source,
        commandSource: request.commandSource,
        provider: requestedProvider ?? "codex",
        model: options.model ?? request.metadata.model ?? "gpt-5-codex",
        policyVersionId: request.policyVersionId,
        status: "completed",
        findings: findings2,
        context: context2,
        convention: request.metadata.convention,
        summary: runtimeResult2.summary,
        severityCounts: {
          low: countSeverity2(findings2, "low"),
          medium: countSeverity2(findings2, "medium"),
          high: countSeverity2(findings2, "high"),
          critical: countSeverity2(findings2, "critical")
        },
        durationMs: runtimeResult2.durationMs,
        startedAt: startedAt2,
        completedAt: completedAt2,
        artifacts: [
          {
            id: randomUUID(),
            kind: "terminal",
            label: "Terminal Summary",
            mimeType: "text/plain",
            content: renderTerminalSession(request, findings2)
          },
          {
            id: randomUUID(),
            kind: "raw-provider-output",
            label: runtimeResult2.artifactLabel,
            mimeType: "application/json",
            content: runtimeResult2.rawOutput
          }
        ]
      };
    }
  }
  if (!shouldUseQwenRuntime(cwd, requestedProvider)) {
    return createReviewSession(request);
  }
  const runtimeResult = runQwenHeadlessReview(request, options);
  if (!runtimeResult) {
    return createReviewSession(request);
  }
  const diffFiles = parseDiffFiles(request.diff);
  const findings = runtimeResult.findings.map(
    (finding) => enrichFindingLocation(finding, request, diffFiles)
  );
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const completedAt = (/* @__PURE__ */ new Date()).toISOString();
  const context = request.metadata.context ?? buildReviewContextSummary(request);
  return {
    id: randomUUID(),
    traceId: request.traceId,
    requestId: request.id,
    source: request.source,
    commandSource: request.commandSource,
    provider: options.provider ?? request.metadata.provider ?? "qwen",
    model: options.model ?? request.metadata.model ?? "qwen-code",
    policyVersionId: request.policyVersionId,
    status: "completed",
    findings,
    context,
    convention: request.metadata.convention,
    summary: runtimeResult.summary,
    severityCounts: {
      low: countSeverity2(findings, "low"),
      medium: countSeverity2(findings, "medium"),
      high: countSeverity2(findings, "high"),
      critical: countSeverity2(findings, "critical")
    },
    durationMs: runtimeResult.durationMs,
    startedAt,
    completedAt,
    artifacts: [
      {
        id: randomUUID(),
        kind: "terminal",
        label: "Terminal Summary",
        mimeType: "text/plain",
        content: renderTerminalSession(request, findings)
      },
      {
        id: randomUUID(),
        kind: "raw-provider-output",
        label: runtimeResult.artifactLabel,
        mimeType: "application/json",
        content: runtimeResult.rawOutput
      }
    ]
  };
}
function sanitizeReviewSessionForCloudSync(session, options = {}) {
  const normalizedOptions = {
    redactText: options.redactText ?? true,
    omitRawProviderOutput: options.omitRawProviderOutput ?? true
  };
  return {
    ...session,
    summary: normalizedOptions.redactText ? redactSensitiveText(session.summary) ?? session.summary : session.summary,
    findings: session.findings.map((finding) => ({
      ...finding,
      title: normalizedOptions.redactText ? redactSensitiveText(finding.title) ?? finding.title : finding.title,
      summary: normalizedOptions.redactText ? redactSensitiveText(finding.summary) ?? finding.summary : finding.summary,
      excerpt: normalizedOptions.redactText ? redactSensitiveText(finding.excerpt) : finding.excerpt,
      suggestedAction: normalizedOptions.redactText ? redactSensitiveText(finding.suggestedAction) : finding.suggestedAction
    })),
    artifacts: session.artifacts.map(
      (artifact) => sanitizeArtifactForCloudSync(artifact, normalizedOptions)
    )
  };
}
function runDoctor(cwd) {
  const gitVersion = tryRun("git", ["--version"], cwd);
  const codexVersion = tryRun("codex", ["--version"], cwd);
  const codexLoginStatus = codexVersion ? tryRun("codex", ["login", "status"], cwd) : null;
  const antigravityVersion = tryRun("antigravity", ["--version"], cwd);
  const qwenVersion = tryRun("qwen", ["--version"], cwd) ?? tryRun("qwen-code", ["--version"], cwd) ?? tryRun("qwen-code-cli", ["--version"], cwd);
  const apiKeySource = detectLocalApiKeySource();
  return [
    {
      id: "git",
      label: "Git",
      status: gitVersion ? "ok" : "fail",
      detail: gitVersion ?? "Git is not available in PATH."
    },
    {
      id: "codex",
      label: "Codex",
      status: codexVersion && codexLoginStatus?.toLowerCase().startsWith("logged in") ? "ok" : "warn",
      detail: codexVersion ? `${codexVersion}${codexLoginStatus ? ` \xB7 ${codexLoginStatus}` : " \xB7 run `codex login`"}` : "Codex CLI was not detected. Install Codex or keep Diffmint in scaffold mode."
    },
    {
      id: "antigravity",
      label: "Antigravity",
      status: antigravityVersion ? "ok" : "warn",
      detail: antigravityVersion ? `${antigravityVersion} \xB7 local desktop auth can stay on the user machine.` : "Antigravity was not detected. Local desktop BYOK flow is unavailable."
    },
    {
      id: "qwen",
      label: "Qwen Code",
      status: qwenVersion ? "ok" : "warn",
      detail: qwenVersion ?? "Qwen Code was not detected. Review runs will stay in scaffold mode."
    },
    {
      id: "api-key",
      label: "Local API key",
      status: apiKeySource ? "ok" : "warn",
      detail: apiKeySource ? `${apiKeySource} detected. Diffmint does not store provider keys on the server.` : "No local API key detected. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, QWEN_API_KEY, or DASHSCOPE_API_KEY for BYOK API mode."
    },
    {
      id: "api",
      label: "API base URL",
      status: process.env.DIFFMINT_API_BASE_URL ? "ok" : "warn",
      detail: process.env.DIFFMINT_API_BASE_URL ?? "Set DIFFMINT_API_BASE_URL to connect CLI sync and device auth to the control plane."
    }
  ];
}

// src/history.ts
function normalizeValue(value) {
  return value?.trim().toLowerCase() ?? "";
}
function buildSearchableText(entry) {
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
  ].filter(Boolean).join("\n").toLowerCase();
}
function filterHistorySessions(entries, options) {
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
function matchesSelector(entry, selector, index) {
  if (selector === "latest") {
    return index === 0;
  }
  if (selector === "previous") {
    return index === 1;
  }
  return entry.traceId === selector || entry.traceId.startsWith(selector);
}
function findHistorySessionBySelector(entries, selector) {
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

// src/presentation.ts
import path3 from "node:path";
function renderSection(title, lines) {
  return [title, ...lines, ""];
}
function formatSeveritySummary(entry) {
  return [
    `Critical ${entry.severityCounts.critical}`,
    `High ${entry.severityCounts.high}`,
    `Medium ${entry.severityCounts.medium}`,
    `Low ${entry.severityCounts.low}`
  ].join(" | ");
}
function formatSourceLabel(value) {
  return value.split("_").join(" ");
}
function formatFindingTitles(findings) {
  return findings.length === 0 ? "None" : findings.map((finding) => finding.title).join(", ");
}
function renderCliHelp() {
  return [
    "Diffmint CLI",
    "============",
    "",
    "Auth",
    "  dm auth login",
    "  dm auth login remote",
    "  dm auth login codex",
    "  dm auth login antigravity",
    "  dm auth login api",
    "  dm auth logout",
    "",
    "Provider Config",
    "  dm config set-provider codex",
    "  dm config set-model gpt-5-codex",
    "",
    "Review",
    "  dm review",
    "  dm review --staged",
    "  dm review --base origin/main",
    "  dm review --files src/a.ts src/b.ts",
    "",
    "Analysis",
    "  dm explain <file>",
    "  dm tests <file>",
    "",
    "Diagnostics",
    "  dm history",
    "  dm history --json",
    "  dm history --provider codex --query auth",
    "  dm history --compare latest previous",
    "  dm doctor",
    "  dm doctor --json",
    "",
    "Output Modes",
    "  dm review --json",
    "  dm review --markdown",
    "",
    "Examples",
    "  dm review --base origin/main --mode security",
    "  dm review --files apps/cli/src/index.ts --markdown",
    "  dm auth login codex",
    "  dm auth login api OPENAI_API_KEY",
    "  dm config set-model claude-sonnet-4-5",
    "  dm history --json",
    "  dm history --compare latest previous",
    "  dm doctor --json"
  ].join("\n");
}
function renderDoctorChecks(checks) {
  const lines = ["Diffmint Doctor", "===============", ""];
  for (const check of checks) {
    lines.push(`[${check.status.toUpperCase()}] ${check.label}`);
    lines.push(`  ${check.detail}`);
  }
  return lines.join("\n");
}
function renderHistorySessions(entries) {
  if (entries.length === 0) {
    return [
      "Diffmint History",
      "===============",
      "",
      "No local or synced review sessions yet."
    ].join("\n");
  }
  const lines = ["Diffmint History", "===============", ""];
  entries.forEach((entry, index) => {
    lines.push(`${index + 1}. ${entry.summary}`);
    lines.push(`   Trace ID: ${entry.traceId}`);
    lines.push(`   Status: ${entry.status}`);
    lines.push(`   Source: ${formatSourceLabel(entry.source)} \xB7 ${entry.commandSource}`);
    lines.push(`   Severity: ${formatSeveritySummary(entry)}`);
    if (entry.context?.fileSummary) {
      lines.push(`   Scope: ${entry.context.fileSummary}`);
    }
    if (entry.completedAt) {
      lines.push(`   Completed: ${new Date(entry.completedAt).toLocaleString()}`);
    }
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}
function renderHistoryComparison(left, right) {
  const leftTitles = new Set(left.findings.map((finding) => finding.title));
  const rightTitles = new Set(right.findings.map((finding) => finding.title));
  const leftOnly = left.findings.filter((finding) => !rightTitles.has(finding.title));
  const rightOnly = right.findings.filter((finding) => !leftTitles.has(finding.title));
  return [
    "Diffmint History Compare",
    "========================",
    "",
    "Session A",
    `  Trace ID: ${left.traceId}`,
    `  Summary: ${left.summary}`,
    `  Severity: ${formatSeveritySummary(left)}`,
    `  Scope: ${left.context?.fileSummary ?? "No scope metadata"}`,
    `  Findings: ${formatFindingTitles(left.findings)}`,
    "",
    "Session B",
    `  Trace ID: ${right.traceId}`,
    `  Summary: ${right.summary}`,
    `  Severity: ${formatSeveritySummary(right)}`,
    `  Scope: ${right.context?.fileSummary ?? "No scope metadata"}`,
    `  Findings: ${formatFindingTitles(right.findings)}`,
    "",
    "Finding Deltas",
    `  Only in A: ${formatFindingTitles(leftOnly)}`,
    `  Only in B: ${formatFindingTitles(rightOnly)}`,
    "",
    "Next Step",
    "  - Reopen the two trace IDs above and confirm whether the newer report improved the highest-risk findings."
  ].join("\n");
}
function renderExplainOutput(target, source) {
  const exportLines = source.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("export ")).slice(0, 4);
  const isClient = source.includes("'use client'") || source.includes('"use client"');
  const lineCount = source.split("\n").length;
  const nextCommand = `dm tests ${target}`;
  const signals = [
    `Path: ${target}`,
    `Lines: ${lineCount}`,
    `Runtime: ${isClient ? "client component or browser-aware module" : "server or shared module"}`,
    `Exports: ${exportLines.length > 0 ? exportLines.length : 0}`
  ];
  const sections = ["Diffmint Explain", "================", ""];
  sections.push(
    ...renderSection(
      "Overview",
      signals.map((line) => `  ${line}`)
    )
  );
  if (exportLines.length > 0) {
    sections.push(
      ...renderSection(
        "Code Signals",
        exportLines.map((line) => `  ${line}`)
      )
    );
  }
  sections.push(
    ...renderSection("Next Steps", [
      `  - Run \`${nextCommand}\` if this file changes behavior or contracts.`,
      `  - Open ${path3.basename(target)} in the editor and compare the exported surface against the diff.`
    ])
  );
  return sections.join("\n").trimEnd();
}
function renderSuggestedTests(target) {
  const name = path3.basename(target);
  return [
    "Diffmint Tests",
    "==============",
    "",
    "Coverage Plan",
    `  Target: ${name}`,
    "  1. Cover the primary happy path.",
    "  2. Validate error handling and empty-state behavior.",
    "  3. Verify policy or auth boundaries when control-plane logic is involved.",
    "  4. Confirm trace IDs or sync metadata are preserved when applicable.",
    "",
    "Suggested Next Step",
    `  - Add or update a test file adjacent to ${name} before merge.`
  ].join("\n");
}

// src/index.ts
var DIFFMINT_HOME = path4.join(homedir(), ".diffmint");
var CONFIG_PATH = path4.join(DIFFMINT_HOME, "config.json");
var HISTORY_PATH = path4.join(DIFFMINT_HOME, "history.jsonl");
var SYNC_QUEUE_PATH = path4.join(DIFFMINT_HOME, "sync-queue.json");
var CLI_VERSION = (() => {
  try {
    const packageJsonUrl = new URL("../package.json", import.meta.url);
    const packageJson = JSON.parse(readFileSync3(packageJsonUrl, "utf8"));
    return packageJson.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
})();
function tryExec(command, args, cwd = process.cwd()) {
  try {
    return execFileSync2(command, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
function detectLocalApiKeySource2() {
  const candidates = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "QWEN_API_KEY", "DASHSCOPE_API_KEY"];
  return candidates.find((candidate) => process.env[candidate]?.trim());
}
function getDefaultModelForProvider(provider) {
  if (provider === "codex") {
    return "gpt-5-codex";
  }
  if (provider === "antigravity") {
    return "antigravity-agent";
  }
  if (provider === "api" || provider === "openai-compatible" || provider === "anthropic-compatible") {
    return "user-configured";
  }
  if (provider?.startsWith("qwen")) {
    return "qwen-code";
  }
  return "user-configured";
}
function inferProviderAuthMode(provider, fallback = "api") {
  if (provider === "codex") {
    return "codex";
  }
  if (provider === "antigravity") {
    return "antigravity";
  }
  if (provider === "api" || provider === "openai-compatible" || provider === "anthropic-compatible") {
    return "api";
  }
  return fallback;
}
function resolveModelForProvider(config, provider) {
  const previousDefault = getDefaultModelForProvider(config.provider);
  const nextDefault = getDefaultModelForProvider(provider);
  if (!config.model || config.model === previousDefault) {
    return nextDefault;
  }
  return config.model;
}
function hasCodexLogin(cwd = process.cwd()) {
  const loginStatus = tryExec("codex", ["login", "status"], cwd);
  return Boolean(loginStatus && loginStatus.toLowerCase().startsWith("logged in"));
}
function hasAntigravityBinary(cwd = process.cwd()) {
  return Boolean(tryExec("antigravity", ["--version"], cwd));
}
function hasRemoteControlPlaneSession(config) {
  return Boolean(config.workspace && config.lastDeviceCode);
}
function buildDefaultSyncDefaults(config) {
  return config.syncDefaults ?? {
    cloudSyncEnabled: hasRemoteControlPlaneSession(config),
    localOnlyDefault: !hasRemoteControlPlaneSession(config),
    redactionEnabled: true
  };
}
function getEffectiveProviderSelection(config) {
  if (config.provider) {
    return {
      provider: config.provider,
      model: config.model ?? getDefaultModelForProvider(config.provider),
      providerAuthMode: config.providerAuthMode ?? inferProviderAuthMode(config.provider),
      providerApiKeyEnvVar: config.providerApiKeyEnvVar ?? (inferProviderAuthMode(config.provider) === "api" ? detectLocalApiKeySource2() : void 0)
    };
  }
  if (hasCodexLogin()) {
    return {
      provider: "codex",
      model: config.model ?? getDefaultModelForProvider("codex"),
      providerAuthMode: "codex"
    };
  }
  const apiKeyEnvVar = detectLocalApiKeySource2();
  if (apiKeyEnvVar) {
    return {
      provider: "api",
      model: config.model ?? getDefaultModelForProvider("api"),
      providerAuthMode: "api",
      providerApiKeyEnvVar: apiKeyEnvVar
    };
  }
  if (hasAntigravityBinary()) {
    return {
      provider: "antigravity",
      model: config.model ?? getDefaultModelForProvider("antigravity"),
      providerAuthMode: "antigravity"
    };
  }
  const provider = config.provider ?? "api";
  return {
    provider,
    model: config.model ?? getDefaultModelForProvider(provider),
    providerAuthMode: config.providerAuthMode ?? inferProviderAuthMode(provider),
    providerApiKeyEnvVar: config.providerApiKeyEnvVar
  };
}
function buildConfiguredLocalConfig(config, selection) {
  return {
    ...config,
    apiBaseUrl: getApiBaseUrl(config),
    workspace: config.workspace ?? {
      id: "ws_local",
      name: "Local Workspace"
    },
    provider: selection.provider,
    model: selection.model,
    providerAuthMode: selection.providerAuthMode,
    providerApiKeyEnvVar: selection.providerApiKeyEnvVar,
    syncDefaults: buildDefaultSyncDefaults(config),
    signedInAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function buildCodexLocalConfig(config) {
  const codexVersion = tryExec("codex", ["--version"]);
  if (!codexVersion) {
    throw new Error(
      "Codex CLI was not detected. Install Codex before running `dm auth login codex`."
    );
  }
  if (!hasCodexLogin()) {
    throw new Error("Codex CLI is installed but not authenticated. Run `codex login` first.");
  }
  return buildConfiguredLocalConfig(config, {
    provider: "codex",
    model: config.provider === "codex" ? config.model ?? "gpt-5-codex" : "gpt-5-codex",
    providerAuthMode: "codex"
  });
}
function buildAntigravityLocalConfig(config) {
  if (!hasAntigravityBinary()) {
    throw new Error(
      "Antigravity was not detected. Install Antigravity before running `dm auth login antigravity`."
    );
  }
  return buildConfiguredLocalConfig(config, {
    provider: "antigravity",
    model: config.provider === "antigravity" ? config.model ?? "antigravity-agent" : "antigravity-agent",
    providerAuthMode: "antigravity"
  });
}
function buildApiLocalConfig(config, explicitEnvVar) {
  const apiKeyEnvVar = explicitEnvVar ?? detectLocalApiKeySource2();
  if (!apiKeyEnvVar) {
    throw new Error(
      "No local API key detected. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, QWEN_API_KEY, or DASHSCOPE_API_KEY before running `dm auth login api`."
    );
  }
  if (!process.env[apiKeyEnvVar]?.trim()) {
    throw new Error(`Environment variable ${apiKeyEnvVar} is not set.`);
  }
  return buildConfiguredLocalConfig(config, {
    provider: "api",
    model: config.provider === "api" ? config.model ?? "user-configured" : "user-configured",
    providerAuthMode: "api",
    providerApiKeyEnvVar: apiKeyEnvVar
  });
}
function ensureHome() {
  mkdirSync(DIFFMINT_HOME, { recursive: true });
}
function readConfig() {
  ensureHome();
  if (!existsSync3(CONFIG_PATH)) {
    return {};
  }
  return JSON.parse(readFileSync3(CONFIG_PATH, "utf8"));
}
function writeConfig(config) {
  ensureHome();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}
function appendHistory(record) {
  ensureHome();
  const prefix = existsSync3(HISTORY_PATH) ? readFileSync3(HISTORY_PATH, "utf8") : "";
  const next = `${prefix}${JSON.stringify(record)}
`;
  writeFileSync(HISTORY_PATH, next, "utf8");
}
function readHistory() {
  ensureHome();
  if (!existsSync3(HISTORY_PATH)) {
    return [];
  }
  return readFileSync3(HISTORY_PATH, "utf8").split("\n").map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
}
function readSyncQueue() {
  ensureHome();
  if (!existsSync3(SYNC_QUEUE_PATH)) {
    return [];
  }
  try {
    const parsed = JSON.parse(readFileSync3(SYNC_QUEUE_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function writeSyncQueue(entries) {
  ensureHome();
  writeFileSync(SYNC_QUEUE_PATH, JSON.stringify(entries, null, 2) + "\n", "utf8");
}
function getSyncQueueSize() {
  return readSyncQueue().length;
}
function appendSyncQueue(entries) {
  const nextEntries = [...readSyncQueue(), ...entries];
  writeSyncQueue(nextEntries);
  return nextEntries.length;
}
function printHelp() {
  console.log(renderCliHelp());
}
function parseFlags(args) {
  const flags = {
    staged: false,
    baseRef: void 0,
    files: [],
    json: false,
    markdown: false,
    mode: "full"
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--staged") {
      flags.staged = true;
      continue;
    }
    if (arg === "--base") {
      flags.baseRef = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--mode") {
      flags.mode = args[index + 1] ?? "full";
      index += 1;
      continue;
    }
    if (arg === "--json") {
      flags.json = true;
      continue;
    }
    if (arg === "--markdown") {
      flags.markdown = true;
      continue;
    }
    if (arg === "--files") {
      const files = [];
      let pointer = index + 1;
      while (pointer < args.length && !args[pointer].startsWith("--")) {
        files.push(args[pointer]);
        pointer += 1;
      }
      flags.files = files;
      index = pointer - 1;
    }
  }
  return flags;
}
function parseHistoryFlags(args) {
  const flags = {
    json: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      flags.json = true;
      continue;
    }
    if (arg === "--provider") {
      flags.provider = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--policy") {
      flags.policy = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--source") {
      flags.source = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--query") {
      flags.query = args[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--limit") {
      const value = Number(args[index + 1]);
      flags.limit = Number.isFinite(value) && value > 0 ? value : void 0;
      index += 1;
      continue;
    }
    if (arg === "--compare") {
      const leftSelector = args[index + 1];
      const rightSelector = args[index + 2];
      if (leftSelector && rightSelector) {
        flags.compare = {
          leftSelector,
          rightSelector
        };
      }
      index += 2;
    }
  }
  return flags;
}
function output(data, asJson) {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2));
}
function hasFlag(args, flag) {
  return args.includes(flag);
}
function getApiBaseUrl(config) {
  return config.apiBaseUrl ?? process.env.DIFFMINT_API_BASE_URL ?? "https://diffmint.deplio.app";
}
async function readJson(response) {
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    const requestId = response.headers.get("x-diffmint-request-id");
    try {
      const payload = await response.json();
      if (payload.error) {
        detail = payload.error;
      }
    } catch {
    }
    if (requestId) {
      detail = `${detail} (request: ${requestId})`;
    }
    throw new Error(detail);
  }
  return await response.json();
}
function createRequestHeaders(config, headers) {
  const mergedHeaders = new Headers(headers);
  if (config?.lastDeviceCode) {
    mergedHeaders.set("authorization", `Bearer ${config.lastDeviceCode}`);
  }
  return mergedHeaders;
}
async function fetchApi(baseUrl, pathname, init, config) {
  const url = new URL(pathname, baseUrl).toString();
  const response = await fetch(url, {
    ...init,
    headers: createRequestHeaders(config, init?.headers)
  });
  return readJson(response);
}
async function postApi(baseUrl, pathname, body, config) {
  return fetchApi(
    baseUrl,
    pathname,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: body === void 0 ? void 0 : JSON.stringify(body)
    },
    config
  );
}
function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
function getClientChannel() {
  const value = process.env.DIFFMINT_RELEASE_CHANNEL;
  if (value === "preview" || value === "canary") {
    return value;
  }
  return "stable";
}
function buildClientInstallationPayload() {
  return {
    clientType: "cli",
    platform: `${process.platform}-${process.arch}`,
    version: CLI_VERSION,
    channel: getClientChannel()
  };
}
async function registerClientInstallationRemote(config) {
  if (!config.workspace || !config.lastDeviceCode) {
    return;
  }
  try {
    await postApi(
      getApiBaseUrl(config),
      "/api/client/installations",
      buildClientInstallationPayload(),
      config
    );
  } catch {
  }
}
async function waitForDeviceApproval(baseUrl, session) {
  const timeoutMs = Number(process.env.DIFFMINT_DEVICE_AUTH_TIMEOUT_MS ?? 1e4);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const nextSession = await postApi(baseUrl, "/api/client/device/poll", {
      deviceCode: session.deviceCode
    });
    if (nextSession.status !== "pending") {
      return nextSession;
    }
    await delay(nextSession.intervalSeconds * 1e3);
  }
  throw new Error("Timed out waiting for device approval.");
}
async function tryRemoteLogin(config) {
  const apiBaseUrl = getApiBaseUrl(config);
  const session = await postApi(apiBaseUrl, "/api/client/device/start", {
    workspaceId: config.workspace?.id
  });
  const verificationUrl = session.verificationUriComplete ?? session.verificationUri;
  console.log(`Open the device flow in your browser: ${verificationUrl}`);
  console.log(`Enter code: ${session.userCode}`);
  const approvedSession = await waitForDeviceApproval(apiBaseUrl, session);
  if (approvedSession.status !== "approved") {
    throw new Error(`Device approval ended with status: ${approvedSession.status}`);
  }
  const bootstrap = await fetchApi(
    apiBaseUrl,
    "/api/client/bootstrap",
    void 0,
    {
      ...config,
      lastDeviceCode: approvedSession.deviceCode
    }
  );
  const nextConfig = {
    ...config,
    apiBaseUrl,
    provider: bootstrap.provider.provider,
    model: bootstrap.provider.defaultModel,
    providerAuthMode: "remote",
    providerApiKeyEnvVar: void 0,
    role: bootstrap.role,
    policyVersionId: bootstrap.policy.policyVersionId,
    workspace: {
      id: bootstrap.workspace.id,
      name: bootstrap.workspace.name,
      slug: bootstrap.workspace.slug
    },
    syncDefaults: bootstrap.syncDefaults,
    lastDeviceCode: approvedSession.deviceCode,
    signedInAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await registerClientInstallationRemote(nextConfig);
  return nextConfig;
}
function buildLocalFallbackConfig(config) {
  return buildConfiguredLocalConfig(config, getEffectiveProviderSelection(config));
}
function buildSyncQueueEntries(config, session) {
  if (!config.workspace) {
    return [];
  }
  const syncedSession = config.syncDefaults?.redactionEnabled === false ? session : sanitizeReviewSessionForCloudSync(session);
  const reviewPayload = {
    ...syncedSession,
    workspaceId: config.workspace.id
  };
  const usagePayload = {
    workspaceId: config.workspace.id,
    source: session.commandSource,
    event: "sync.uploaded",
    metadata: {
      traceId: session.traceId
    }
  };
  return [
    {
      id: `sync-${randomUUID2()}`,
      workspaceId: config.workspace.id,
      pathname: "/api/client/history",
      body: reviewPayload
    },
    {
      id: `sync-${randomUUID2()}`,
      workspaceId: config.workspace.id,
      pathname: "/api/client/usage",
      body: usagePayload
    }
  ];
}
async function flushSyncQueue(config) {
  const queuedEntries = readSyncQueue();
  if (queuedEntries.length === 0 || !config.workspace || !hasRemoteControlPlaneSession(config) || config.syncDefaults?.cloudSyncEnabled === false) {
    return {
      flushed: 0,
      remaining: queuedEntries.length
    };
  }
  const apiBaseUrl = getApiBaseUrl(config);
  const nextQueue = [];
  let flushed = 0;
  for (let index = 0; index < queuedEntries.length; index += 1) {
    const entry = queuedEntries[index];
    if (entry.workspaceId !== config.workspace.id) {
      nextQueue.push(entry);
      continue;
    }
    try {
      await postApi(apiBaseUrl, entry.pathname, entry.body, config);
      flushed += 1;
    } catch (error) {
      nextQueue.push(entry, ...queuedEntries.slice(index + 1));
      writeSyncQueue(nextQueue);
      return {
        flushed,
        remaining: nextQueue.length,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  writeSyncQueue(nextQueue);
  return {
    flushed,
    remaining: nextQueue.length
  };
}
async function syncReviewToCloud(config, session) {
  if (!config.workspace || !hasRemoteControlPlaneSession(config) || config.syncDefaults?.cloudSyncEnabled === false) {
    return {
      flushed: 0,
      queued: false,
      queueSize: getSyncQueueSize()
    };
  }
  const flushResult = await flushSyncQueue(config);
  if (flushResult.error) {
    const queueSize = appendSyncQueue(buildSyncQueueEntries(config, session));
    throw new Error(
      `Queued review for later sync: ${flushResult.error}. ${queueSize} queued item(s) waiting.`
    );
  }
  const apiBaseUrl = getApiBaseUrl(config);
  const payload = {
    ...config.syncDefaults?.redactionEnabled === false ? session : sanitizeReviewSessionForCloudSync(session),
    workspaceId: config.workspace.id
  };
  try {
    await postApi(apiBaseUrl, "/api/client/history", payload, config);
    await postApi(
      apiBaseUrl,
      "/api/client/usage",
      {
        workspaceId: config.workspace.id,
        source: session.commandSource,
        event: "sync.uploaded",
        metadata: {
          traceId: session.traceId
        }
      },
      config
    );
  } catch (error) {
    const queueSize = appendSyncQueue(buildSyncQueueEntries(config, session));
    throw new Error(
      `Queued review for later sync: ${error instanceof Error ? error.message : String(error)}. ${queueSize} queued item(s) waiting.`
    );
  }
  return {
    flushed: flushResult.flushed,
    queued: false,
    queueSize: flushResult.remaining
  };
}
async function loadHistory(config) {
  if (!config.workspace || !hasRemoteControlPlaneSession(config)) {
    return readHistory();
  }
  try {
    await flushSyncQueue(config);
    const payload = await fetchApi(
      getApiBaseUrl(config),
      "/api/client/history",
      void 0,
      config
    );
    return payload.items;
  } catch {
    return readHistory();
  }
}
async function extendDoctorOutput(config) {
  const checks = runDoctor(process.cwd());
  const queueSize = getSyncQueueSize();
  const convention = inspectReviewConvention(process.cwd());
  const providerSelection = getEffectiveProviderSelection(config);
  const extendedChecks = [
    ...checks,
    {
      id: "config",
      label: "Local config",
      status: config.signedInAt ? "ok" : "warn",
      detail: config.signedInAt ? `Signed in to ${config.workspace?.name ?? "unknown workspace"}` : "Run `dm auth login`, `dm auth login codex`, `dm auth login antigravity`, or `dm auth login api`."
    },
    {
      id: "selected-provider",
      label: "Selected provider",
      status: providerSelection.provider ? "ok" : "warn",
      detail: [
        `Provider ${providerSelection.provider}`,
        `mode ${providerSelection.providerAuthMode}`,
        `model ${providerSelection.model}`,
        providerSelection.providerApiKeyEnvVar ? `key ${providerSelection.providerApiKeyEnvVar}` : void 0
      ].filter(Boolean).join(" \xB7 ")
    },
    {
      id: "sync-queue",
      label: "Sync queue",
      status: queueSize === 0 ? "ok" : "warn",
      detail: queueSize === 0 ? "No queued sync items." : `${queueSize} queued sync item(s) waiting for the control plane.`
    },
    {
      id: "review-convention",
      label: "Review convention",
      status: convention.status === "loaded" ? "ok" : convention.status === "invalid" ? "warn" : "ok",
      detail: convention.detail
    }
  ];
  if (!config.apiBaseUrl || !hasRemoteControlPlaneSession(config)) {
    return extendedChecks;
  }
  try {
    const bootstrap = await fetchApi(
      config.apiBaseUrl,
      "/api/client/bootstrap",
      void 0,
      config
    );
    const controlPlaneCheck = {
      id: "control-plane",
      label: "Control plane",
      status: "ok",
      detail: `Connected to ${bootstrap.workspace.name} via ${config.apiBaseUrl}`
    };
    return [...extendedChecks, controlPlaneCheck];
  } catch (error) {
    const controlPlaneCheck = {
      id: "control-plane",
      label: "Control plane",
      status: "warn",
      detail: error instanceof Error ? `Configured but unreachable: ${error.message}` : "Configured but unreachable."
    };
    return [...extendedChecks, controlPlaneCheck];
  }
}
async function main() {
  const [command, subcommand, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "auth" && subcommand === "login") {
    const config = readConfig();
    const loginMode = rest[0];
    let nextConfig;
    if (loginMode && loginMode !== "remote" && loginMode !== "codex" && loginMode !== "antigravity" && loginMode !== "api") {
      throw new Error(`Unknown login mode "${loginMode}".`);
    }
    if (loginMode === "codex") {
      nextConfig = buildCodexLocalConfig(config);
      console.log("Configured local Codex auth. Diffmint will keep provider auth on this machine.");
    } else if (loginMode === "antigravity") {
      nextConfig = buildAntigravityLocalConfig(config);
      console.log(
        "Configured local Antigravity auth. Diffmint will keep provider auth on this machine."
      );
    } else if (loginMode === "api") {
      nextConfig = buildApiLocalConfig(config, rest[1]);
      console.log(
        "Configured local API-key auth. Diffmint will keep provider keys on this machine only."
      );
    } else {
      try {
        nextConfig = await tryRemoteLogin(config);
      } catch (error) {
        nextConfig = buildLocalFallbackConfig(config);
        console.log(
          `Control plane login unavailable, using local fallback: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    writeConfig(nextConfig);
    if (nextConfig.workspace && nextConfig.syncDefaults?.cloudSyncEnabled !== false && hasRemoteControlPlaneSession(nextConfig)) {
      const flushResult = await flushSyncQueue(nextConfig);
      if (flushResult.flushed > 0) {
        console.log(`Flushed ${flushResult.flushed} queued sync item(s).`);
      }
      if (flushResult.error) {
        console.log(`Queued sync items still pending: ${flushResult.error}`);
      }
    }
    console.log(`Signed in to Diffmint.`);
    console.log(`Workspace: ${nextConfig.workspace?.name}`);
    console.log(`Control plane: ${nextConfig.apiBaseUrl}`);
    if (nextConfig.policyVersionId) {
      console.log(`Policy version: ${nextConfig.policyVersionId}`);
    }
    if (nextConfig.provider) {
      console.log(`Provider: ${nextConfig.provider}`);
    }
    if (nextConfig.model) {
      console.log(`Model: ${nextConfig.model}`);
    }
    if (nextConfig.providerAuthMode) {
      console.log(`Auth mode: ${nextConfig.providerAuthMode}`);
    }
    if (nextConfig.providerApiKeyEnvVar) {
      console.log(`API key env: ${nextConfig.providerApiKeyEnvVar}`);
    }
    return;
  }
  if (command === "auth" && subcommand === "logout") {
    const config = readConfig();
    if (config.lastDeviceCode && config.apiBaseUrl) {
      try {
        await postApi(
          config.apiBaseUrl,
          "/api/client/device/logout",
          {
            deviceCode: config.lastDeviceCode
          },
          config
        );
      } catch {
      }
    }
    writeConfig({});
    console.log("Signed out from Diffmint.");
    return;
  }
  if (command === "config" && subcommand === "set-provider") {
    const provider = rest[0];
    if (!provider) {
      throw new Error("Expected a provider name.");
    }
    const config = readConfig();
    writeConfig({
      ...config,
      provider,
      model: resolveModelForProvider(config, provider),
      providerAuthMode: inferProviderAuthMode(provider, config.providerAuthMode),
      providerApiKeyEnvVar: inferProviderAuthMode(provider, config.providerAuthMode) === "api" ? config.providerApiKeyEnvVar ?? detectLocalApiKeySource2() : void 0
    });
    console.log(`Provider set to ${provider}.`);
    return;
  }
  if (command === "config" && subcommand === "set-model") {
    const model = rest[0];
    if (!model) {
      throw new Error("Expected a model name.");
    }
    const config = readConfig();
    writeConfig({
      ...config,
      model
    });
    console.log(`Model set to ${model}.`);
    return;
  }
  if (command === "review") {
    const config = readConfig();
    const providerSelection = getEffectiveProviderSelection(config);
    const flags = parseFlags([subcommand, ...rest].filter(Boolean));
    const source = flags.files.length > 0 ? "selected_files" : flags.baseRef ? "branch_compare" : "local_diff";
    const policy = config.policyVersionId ? {
      workspaceId: config.workspace?.id ?? "ws_local",
      policySetId: "seed-policy",
      policyVersionId: config.policyVersionId,
      name: "Workspace Policy",
      version: config.policyVersionId,
      checksum: config.policyVersionId,
      publishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      summary: "Workspace policy metadata loaded from the control plane.",
      checklist: [],
      rules: []
    } : void 0;
    const request = buildReviewRequest({
      cwd: process.cwd(),
      source,
      baseRef: flags.baseRef,
      files: flags.files,
      staged: flags.staged,
      outputFormat: flags.json ? "json" : flags.markdown ? "markdown" : "terminal",
      mode: flags.mode,
      localOnly: config.syncDefaults?.localOnlyDefault ?? !hasRemoteControlPlaneSession(config),
      cloudSyncEnabled: config.syncDefaults?.cloudSyncEnabled ?? hasRemoteControlPlaneSession(config),
      provider: providerSelection.provider,
      model: providerSelection.model,
      policy
    });
    const session = await createReviewSessionWithRuntime(request, {
      cwd: process.cwd(),
      provider: providerSelection.provider,
      model: providerSelection.model,
      policy
    });
    appendHistory(session);
    if (!request.localOnly && request.cloudSyncEnabled) {
      try {
        await syncReviewToCloud(config, session);
      } catch (error) {
        const message = `Cloud sync skipped: ${error instanceof Error ? error.message : String(error)}`;
        if (flags.json) {
          console.error(message);
        } else {
          console.log(message);
        }
      }
    }
    if (flags.json) {
      output(session, true);
      return;
    }
    if (flags.markdown) {
      console.log(renderMarkdownSession(session));
      return;
    }
    console.log(renderTerminalSession(request, session.findings));
    return;
  }
  if (command === "history") {
    const historyArgs = [subcommand, ...rest].filter(Boolean);
    const flags = parseHistoryFlags(historyArgs);
    const history = await loadHistory(readConfig());
    const filteredHistory = filterHistorySessions(history, {
      provider: flags.provider,
      policy: flags.policy,
      source: flags.source,
      query: flags.query,
      limit: flags.limit
    });
    if (flags.compare) {
      const left = findHistorySessionBySelector(filteredHistory, flags.compare.leftSelector);
      const right = findHistorySessionBySelector(filteredHistory, flags.compare.rightSelector);
      if (!left || !right) {
        throw new Error(
          `Unable to resolve history comparison targets: ${flags.compare.leftSelector}, ${flags.compare.rightSelector}`
        );
      }
      if (flags.json) {
        output({ left, right }, true);
      } else {
        console.log(renderHistoryComparison(left, right));
      }
      return;
    }
    if (flags.json) {
      output(filteredHistory, true);
    } else {
      console.log(renderHistorySessions(filteredHistory));
    }
    return;
  }
  if (command === "doctor") {
    const checks = await extendDoctorOutput(readConfig());
    if (hasFlag([subcommand, ...rest].filter(Boolean), "--json")) {
      output(checks, true);
      return;
    }
    console.log(renderDoctorChecks(checks));
    return;
  }
  if (command === "explain") {
    const target = subcommand;
    if (!target) {
      throw new Error("Expected a file path.");
    }
    const absolute = path4.resolve(process.cwd(), target);
    const source = readFileSync3(absolute, "utf8");
    console.log(renderExplainOutput(target, source));
    return;
  }
  if (command === "tests") {
    const target = subcommand;
    if (!target) {
      throw new Error("Expected a file path.");
    }
    console.log(renderSuggestedTests(target));
    return;
  }
  printHelp();
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
