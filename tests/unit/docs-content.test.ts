import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDocsCache,
  getAllDocs,
  getDocBySlug,
  getDocsNavigation,
  getRelatedDocs
} from '../../packages/docs-content/src/index.ts';

describe('docs content', () => {
  beforeEach(() => {
    clearDocsCache();
  });

  it('loads the canonical quickstart doc by default', () => {
    const docs = getAllDocs();
    const doc = getDocBySlug();

    expect(docs.length).toBeGreaterThanOrEqual(17);
    expect(doc?.slug).toBe('getting-started/5-minute-quickstart');
    expect(doc?.internalLinks).toContain('/docs/getting-started/install-cli');
  });

  it('builds navigation in the published IA order', () => {
    const navigation = getDocsNavigation();

    expect(navigation[0]?.section).toBe('Getting Started');
    expect(navigation.map((group) => group.section)).not.toContain('Changelog');
    expect(
      navigation.flatMap((group) => group.items).some((item) => item.slug === 'cli/reference')
    ).toBe(true);
  });

  it('resolves related docs for quickstart onboarding', () => {
    const quickstart = getDocBySlug(['getting-started', '5-minute-quickstart']);

    expect(quickstart).toBeDefined();

    const relatedDocs = getRelatedDocs(quickstart!);
    const relatedSlugs = relatedDocs.map((doc) => doc.slug);

    expect(relatedSlugs).toContain('getting-started/install-cli');
    expect(relatedSlugs).toContain('troubleshooting/auth-and-doctor');
  });
});
