import type { InfobarContent } from '@/components/ui/infobar';

function link(title: string, url: string) {
  return { title, url };
}

export const overviewInfoContent: InfobarContent = {
  title: 'Control Plane Overview',
  sections: [
    {
      title: 'Control plane, not review surface',
      description:
        'Devflow keeps the primary review workflow in the CLI and VS Code. The dashboard manages workspace settings, policies, billing, history, audit, and docs.',
      links: [
        link('5-Minute Quickstart', '/docs/getting-started/5-minute-quickstart'),
        link('Architecture', '/docs/concepts/architecture')
      ]
    }
  ]
};

export const workspacesInfoContent: InfobarContent = {
  title: 'Workspaces',
  sections: [
    {
      title: 'Workspace scope',
      description:
        'Workspaces define the team boundary for policies, providers, billing, and synced review history.',
      links: [
        link('Workspace Setup', '/docs/admin/workspace-setup'),
        link('Policies and Governance', '/docs/concepts/workspaces-policies-and-governance')
      ]
    }
  ]
};

export const teamInfoContent: InfobarContent = {
  title: 'Team Management',
  sections: [
    {
      title: 'Roles and rollout',
      description:
        'Owners and admins configure provider strategy, policy publishing, billing, and access to synced history and audit.',
      links: [
        link('Workspace Setup', '/docs/admin/workspace-setup'),
        link('Privacy and Redaction', '/docs/security/privacy-and-redaction')
      ]
    }
  ]
};

export const billingInfoContent: InfobarContent = {
  title: 'Billing',
  sections: [
    {
      title: 'Seats and quota',
      description:
        'Billing decisions shape seats, included usage, overage, spend caps, and provider strategy per workspace.',
      links: [
        link('Provider Strategy', '/docs/admin/provider-strategy'),
        link('Privacy and Redaction', '/docs/security/privacy-and-redaction')
      ]
    }
  ]
};

export const providersInfoContent: InfobarContent = {
  title: 'Providers',
  sections: [
    {
      title: 'Managed and BYOK',
      description:
        'Choose managed vs BYOK provider modes, lock default models, set fallbacks, and publish a safe allow-list.',
      links: [
        link('Provider Strategy', '/docs/admin/provider-strategy'),
        link('Qwen Integration Strategy', '/docs/concepts/qwen-integration')
      ]
    }
  ]
};

export const policiesInfoContent: InfobarContent = {
  title: 'Policies',
  sections: [
    {
      title: 'Versioned governance',
      description:
        'Devflow differentiates on governed review. Policy versions define the checklist and rules attached to synced sessions.',
      links: [
        link('Policies and Governance', '/docs/concepts/workspaces-policies-and-governance'),
        link('CLI Reference', '/docs/cli/reference')
      ]
    }
  ]
};

export const historyInfoContent: InfobarContent = {
  title: 'History',
  sections: [
    {
      title: 'Synced sessions',
      description:
        'History stores review metadata and selected artifacts so teams can search by trace ID, provider, or policy version later.',
      links: [
        link('Local-First Review', '/docs/concepts/local-first-review'),
        link('Release Channels', '/docs/release-channels/overview')
      ]
    }
  ]
};

export const auditInfoContent: InfobarContent = {
  title: 'Audit',
  sections: [
    {
      title: 'Admin trail',
      description:
        'Audit events cover provider changes, policy publishes, synced reviews, and future release rollouts.',
      links: [
        link('Privacy and Redaction', '/docs/security/privacy-and-redaction'),
        link('Workspace Setup', '/docs/admin/workspace-setup')
      ]
    }
  ]
};

export const docsCenterInfoContent: InfobarContent = {
  title: 'Docs Center',
  sections: [
    {
      title: 'Canonical docs',
      description:
        'The dashboard docs center uses the same MDX source as public docs while adding shortcuts into the active workspace.',
      links: [
        link('Quickstart', '/docs/getting-started/5-minute-quickstart'),
        link('CLI Reference', '/docs/cli/reference'),
        link('Workspace Setup', '/docs/admin/workspace-setup')
      ]
    }
  ]
};

export const productInfoContent: InfobarContent = {
  title: 'Legacy Starter Page',
  sections: [
    {
      title: 'Starter reference only',
      description:
        'This route remains from the original dashboard starter. Prefer the Devflow control-plane pages for current product work.',
      links: [link('Architecture', '/docs/concepts/architecture')]
    }
  ]
};
