import type {
  FindingSeverity,
  PolicyBundle,
  PolicyChecklistItem,
  PolicyRule
} from '@devflow/contracts';

const severityRank: FindingSeverity[] = ['low', 'medium', 'high', 'critical'];

function sortBySeverity(rules: PolicyRule[]): PolicyRule[] {
  return [...rules].sort(
    (left, right) => severityRank.indexOf(right.severity) - severityRank.indexOf(left.severity)
  );
}

export function createDefaultPolicyBundle(workspaceId: string): PolicyBundle {
  const checklist: PolicyChecklistItem[] = [
    {
      id: 'testing',
      title: 'Require test intent for risky changes',
      guidance: 'Flag missing regression coverage or untested migrations before merge.',
      required: true
    },
    {
      id: 'secrets',
      title: 'Protect secrets and provider credentials',
      guidance: 'Block obvious secret leaks and require redaction before sync.',
      required: true
    },
    {
      id: 'governance',
      title: 'Attach policy metadata to every synced review',
      guidance: 'Include workspace, policy version, provider, and trace ID on uploaded reports.',
      required: true
    }
  ];

  const rules: PolicyRule[] = [
    {
      id: 'security-sensitive-paths',
      category: 'security',
      title: 'Escalate changes to auth, billing, and provider configuration',
      description: 'Critical control-plane files should be reviewed with higher severity.',
      guidance:
        'Prefer security mode or full review when touching auth, billing, secrets, or API keys.',
      severity: 'high'
    },
    {
      id: 'missing-test-coverage',
      category: 'testing',
      title: 'Call out missing automated coverage',
      description:
        'Review findings should mention when risky changes ship without clear validation.',
      guidance:
        'Request tests or a documented verification plan for routing, billing, auth, and policy logic.',
      severity: 'medium'
    },
    {
      id: 'no-full-repo-upload',
      category: 'governance',
      title: 'Stay local-first by default',
      description: 'The main review flow must avoid uploading the full repository.',
      guidance:
        'Sync only metadata and selected artifacts unless the workspace explicitly allows more.',
      severity: 'critical'
    }
  ];

  return {
    workspaceId,
    policySetId: 'core-devflow',
    policyVersionId: 'core-devflow-v1',
    name: 'Devflow Core Rules',
    version: '1.0.0',
    checksum: 'core-devflow-v1',
    publishedAt: new Date().toISOString(),
    summary: 'Secure, local-first review defaults for team-governed code review.',
    checklist,
    rules: sortBySeverity(rules)
  };
}

export function summarizePolicyBundle(bundle: PolicyBundle): string {
  const requiredCount = bundle.checklist.filter((item) => item.required).length;
  const topRules = sortBySeverity(bundle.rules)
    .slice(0, 3)
    .map((rule) => `${rule.title} (${rule.severity})`)
    .join(', ');

  return `${bundle.name} v${bundle.version} with ${requiredCount} required checks. Priority rules: ${topRules}.`;
}

export function buildPolicyPrompt(bundle: PolicyBundle): string {
  const checklist = bundle.checklist.map((item) => `- ${item.title}: ${item.guidance}`).join('\n');
  const rules = sortBySeverity(bundle.rules)
    .map((rule) => `- [${rule.severity}] ${rule.title}: ${rule.guidance}`)
    .join('\n');

  return `Workspace policy: ${bundle.name} v${bundle.version}\n\nChecklist:\n${checklist}\n\nRules:\n${rules}`;
}

export function getWorkspaceControlLinks(basePath = '/dashboard') {
  return {
    providers: `${basePath}/providers`,
    policies: `${basePath}/policies`,
    billing: `${basePath}/billing`,
    history: `${basePath}/history`,
    audit: `${basePath}/audit`,
    docs: `${basePath}/docs`
  };
}
