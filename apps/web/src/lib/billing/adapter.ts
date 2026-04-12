export interface BillingWorkspaceSummary {
  plan: string;
  seatsUsed: number;
  seatLimit: number;
  creditsIncluded: number;
  creditsRemaining: number;
}

export interface BillingAdapter {
  getWorkspaceSummary(workspaceId: string): Promise<BillingWorkspaceSummary>;
}
