import type { BillingAdapter, BillingWorkspaceSummary } from './adapter';

export class ClerkBillingAdapter implements BillingAdapter {
  async getWorkspaceSummary(_workspaceId: string): Promise<BillingWorkspaceSummary> {
    return {
      plan: 'team',
      seatsUsed: 26,
      seatLimit: 30,
      creditsIncluded: 200000,
      creditsRemaining: 156000
    };
  }
}
