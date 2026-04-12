import { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: 'Control Plane',
    items: [
      {
        title: 'Overview',
        url: '/dashboard/overview',
        icon: 'dashboard',
        isActive: false,
        shortcut: ['d', 'o'],
        items: []
      },
      {
        title: 'Workspaces',
        url: '/dashboard/workspaces',
        icon: 'workspace',
        isActive: false,
        items: []
      },
      {
        title: 'Team',
        url: '/dashboard/workspaces/team',
        icon: 'teams',
        isActive: false,
        items: [],
        access: { requireOrg: true }
      },
      {
        title: 'Providers',
        url: '/dashboard/providers',
        icon: 'settings',
        isActive: false,
        shortcut: ['p', 'r'],
        items: []
      },
      {
        title: 'Policies',
        url: '/dashboard/policies',
        icon: 'checks',
        isActive: false,
        shortcut: ['p', 'o'],
        items: []
      },
      {
        title: 'History',
        url: '/dashboard/history',
        icon: 'post',
        isActive: false,
        shortcut: ['h', 'i'],
        items: []
      },
      {
        title: 'Audit',
        url: '/dashboard/audit',
        icon: 'lock',
        isActive: false,
        shortcut: ['a', 'u'],
        items: []
      }
    ]
  },
  {
    label: 'Documentation',
    items: [
      {
        title: 'Docs Center',
        url: '/dashboard/docs',
        icon: 'page',
        isActive: false,
        shortcut: ['d', 'c'],
        items: []
      },
      {
        title: 'Public Docs',
        url: '/docs',
        icon: 'externalLink',
        isActive: false,
        shortcut: ['d', 'd'],
        items: []
      },
      {
        title: 'Install',
        url: '/install',
        icon: 'upload',
        isActive: false,
        shortcut: ['i', 'n'],
        items: []
      }
    ]
  },
  {
    label: 'Account',
    items: [
      {
        title: 'Profile',
        url: '/dashboard/profile',
        icon: 'profile',
        isActive: false,
        items: []
      },
      {
        title: 'Billing',
        url: '/dashboard/billing',
        icon: 'billing',
        isActive: false,
        items: [],
        access: { requireOrg: true }
      }
    ]
  }
];
