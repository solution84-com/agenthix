import { describe, it, expect, vi } from 'vitest'

// The GitHub App's pure helpers. Storing, reading and forgetting the App is
// githubApp.integration.test.ts.

import { convertManifestCode, buildManifest } from '../githubApp'

describe('convertManifestCode (W-1) @SC-1307', () => {
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

describe('buildManifest (R-166) @SC-1307', () => {
  it('names the App from letters and digits of the state only', () => {
    expect(buildManifest('-_ab-cd_efgh').name).toBe('agenthix-abcdefgh')
  })

  it("starts GitHub's page with Agenthix for the organisation's name, fitted to what GitHub takes", () => {
    expect(buildManifest('s', 'Solution84').name).toBe('Agenthix for Solution84')
    expect(buildManifest('s', 'Fernhill & Co: Studio').name).toBe('Agenthix for Fernhill Co Studio')
    expect(buildManifest('s', 'A'.repeat(40)).name).toBe(`Agenthix for ${'A'.repeat(21)}`)
    expect(buildManifest('-_ab-cd_efgh', '***').name).toBe('agenthix-abcdefgh')
  })

  it('sends a person back to HQ\'s GitHub page after they install the App or change what it reaches', () => {
    const m = buildManifest('state')
    expect(m.setup_url).toMatch(/\/admin\/settings\/github$/)
    expect(m.setup_on_update).toBe(true)
  })
})

describe('listAllInstallations', () => {
  const page = (ids: number[], next?: string) => new Response(
    JSON.stringify(ids.map((id) => ({ id, account: { id, login: `a${id}`, type: 'Organization' } }))),
    { status: 200, headers: next ? { link: `<${next}>; rel="next", <https://api.github.com/x>; rel="last"` } : {} },
  )

  it('reads every page, 100 at a time, so nothing past the first page is pruned', async () => {
    const { listAllInstallations } = await import('../githubApp')
    const get = vi.fn()
      .mockResolvedValueOnce(page([1, 2], 'https://api.github.com/app/installations?per_page=100&page=2'))
      .mockResolvedValueOnce(page([3]))
    const all = await listAllInstallations('jwt', get as unknown as typeof fetch)
    expect(all.map((i) => i.id)).toEqual([1, 2, 3])
    expect(get.mock.calls[0][0]).toBe('https://api.github.com/app/installations?per_page=100')
  })

  it('does not follow a next page that points off GitHub', async () => {
    const { listAllInstallations } = await import('../githubApp')
    const get = vi.fn().mockResolvedValueOnce(page([1], 'https://example.com/steal'))
    expect(await listAllInstallations('jwt', get as unknown as typeof fetch)).toHaveLength(1)
    expect(get).toHaveBeenCalledTimes(1)
  })
})
