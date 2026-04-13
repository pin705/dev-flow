import { describe, expect, it } from 'vitest';
import {
  getLiveHealthReport,
  getReadinessHealthReport
} from '../../apps/web/src/lib/runtime/health.ts';

describe('runtime health', () => {
  it('returns an ok live report for the running process', () => {
    const report = getLiveHealthReport();

    expect(report.service).toBe('diffmint-web');
    expect(report.status).toBe('ok');
    expect(report.checks[0]?.name).toBe('process');
  });

  it('returns a warn readiness report when running without a database but docs are loaded', async () => {
    const report = await getReadinessHealthReport({
      env: {},
      docsCountLoader: () => 36,
      databaseChecker: async () => ({
        name: 'database',
        status: 'warn',
        detail: 'DATABASE_URL is not active.'
      })
    });

    expect(report.status).toBe('warn');
    expect(report.checks.find((check) => check.name === 'docs')?.status).toBe('ok');
    expect(report.checks.find((check) => check.name === 'database')?.status).toBe('warn');
  });

  it('returns a fail readiness report when persistence is required but no database is active', async () => {
    const report = await getReadinessHealthReport({
      env: {
        DIFFMINT_REQUIRE_PERSISTENCE: 'true'
      } as NodeJS.ProcessEnv,
      docsCountLoader: () => 36
    });

    expect(report.status).toBe('fail');
    expect(report.checks.find((check) => check.name === 'database')?.detail).toContain(
      'Persistent control-plane storage is required'
    );
  });

  it('returns a fail readiness report in production when no database is active', async () => {
    const report = await getReadinessHealthReport({
      env: {
        NODE_ENV: 'production'
      } as NodeJS.ProcessEnv,
      docsCountLoader: () => 36
    });

    expect(report.status).toBe('fail');
    expect(report.checks.find((check) => check.name === 'database')?.detail).toContain(
      'Persistent control-plane storage is required'
    );
  });

  it('returns a fail readiness report when a required subsystem fails', async () => {
    const report = await getReadinessHealthReport({
      env: {
        POLAR_ACCESS_TOKEN: 'polar_oat_test',
        POLAR_WEBHOOK_SECRET: 'whsec_test'
      } as NodeJS.ProcessEnv,
      docsCountLoader: () => {
        throw new Error('Docs content unavailable');
      },
      databaseChecker: async () => ({
        name: 'database',
        status: 'ok',
        detail: 'Database connection is ready.'
      })
    });

    expect(report.status).toBe('fail');
    expect(report.checks.find((check) => check.name === 'docs')?.detail).toContain(
      'Docs content unavailable'
    );
  });
});
