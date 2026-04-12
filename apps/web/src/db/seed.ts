import {
  ensureControlPlaneSeedData,
  getWorkspaceBootstrap,
  listPolicies,
  listProviders,
  listReviewSessions
} from '../features/control-plane/server/service';

async function main(): Promise<void> {
  await ensureControlPlaneSeedData();

  const [bootstrap, providers, policies, reviews] = await Promise.all([
    getWorkspaceBootstrap(),
    listProviders(),
    listPolicies(),
    listReviewSessions()
  ]);

  console.log(
    [
      `Seed ready for workspace ${bootstrap.workspace.slug}.`,
      `providers=${providers.length}`,
      `policies=${policies.length}`,
      `reviews=${reviews.length}`
    ].join(' ')
  );
}

main().catch((error: unknown) => {
  console.error('Failed to seed Devflow control-plane data.', error);
  process.exitCode = 1;
});
