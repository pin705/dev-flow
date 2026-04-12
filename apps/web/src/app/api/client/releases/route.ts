import { NextResponse } from 'next/server';
import type { ReleaseManifest } from '@devflow/contracts';

export async function GET() {
  const manifests: ReleaseManifest[] = [
    {
      channel: 'stable',
      version: '0.1.0',
      releasedAt: '2026-04-12T00:00:00.000Z',
      cli: {
        version: '0.1.0',
        downloadUrl: 'https://example.com/devflow-cli',
        checksum: 'sha256-cli'
      },
      vscode: {
        version: '0.1.0',
        marketplaceUrl: 'https://example.com/devflow-vscode',
        checksum: 'sha256-vscode'
      },
      notesUrl: 'http://localhost:3000/docs/changelog/2026-04-foundation'
    }
  ];

  return NextResponse.json({
    items: manifests
  });
}
