import { NextResponse } from 'next/server';
import type { WorkspaceBootstrap } from '@devflow/contracts';
import { providerSummaries, policyBundles } from '@/features/control-plane/data';

export async function GET() {
  const payload: WorkspaceBootstrap = {
    workspace: {
      id: 'ws_devflow_core',
      slug: 'devflow-core',
      name: 'Devflow Core'
    },
    role: 'owner',
    policy: policyBundles[0],
    provider: providerSummaries[0],
    quotas: {
      includedCredits: 200000,
      remainingCredits: 156000,
      seats: 26,
      seatLimit: 30,
      spendCapUsd: 500
    },
    syncDefaults: {
      cloudSyncEnabled: true,
      localOnlyDefault: false,
      redactionEnabled: true
    },
    releaseChannels: ['stable', 'preview', 'canary']
  };

  return NextResponse.json(payload);
}
