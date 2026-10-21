import { describe, it, expect, vi } from 'vitest'

// The GitHub App's pure helpers. Storing, reading and forgetting the App is
// githubApp.integration.test.ts.

import { buildInstallationTokenRequest, convertManifestCode, buildManifest } from '../githubApp'

describe('installation token scoping @SC-257', () => {
  it('scopes the mint request to one repo with least-privilege permissions', () => {
    const body = buildInstallationTokenRequest('website')
    expect(body).toEqual({
      repositories: ['website'],
      permissions: { contents: 'write', actions: 'write', secrets: 'write', workflows: 'write', pull_requests: 'write', metadata: 'read' },
    })
  })
})

describe('convertManifestCode (W-1)', () => {
  it('encodes the code into the GitHub path so it cannot steer the request elsewhere', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 1, slug: 's', pem: 'p' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await convertManifestCode('../../users/x?y=1')
    } finally {
      vi.unstubAllGlobals()
    }
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/app-manifests/..%2F..%2Fusers%2Fx%3Fy%3D1/conversions',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})

describe('buildManifest (R-166)', () => {
  it('names the App from letters and digits of the state only', () => {
    expect(buildManifest('-_ab-cd_efgh').name).toBe('agenthix-abcdefgh')
  })
})
