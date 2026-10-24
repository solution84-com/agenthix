import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('../githubApp', () => ({ getAppJwt: vi.fn(async () => 'app-jwt-dummy') }))

import { requestInstallationToken, revokeInstallationToken, tokenRequestBody, GitHubTokenError } from '../installationTokens'

afterEach(() => vi.unstubAllGlobals())

describe('the mint request', () => {
  it('always names its permissions, and scopes by id', () => {
    expect(tokenRequestBody({ installationId: 1, permissions: { contents: 'write' }, repositoryIds: [42] }))
      .toEqual({ permissions: { contents: 'write' }, repository_ids: [42] })
  })

  it('posts to the installation, and answers the repositories GitHub scoped it to', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({
      token: 'ghs_dummy', expires_at: '2026-10-24T12:00:00Z', permissions: { contents: 'write', metadata: 'read' },
      repositories: [{ id: 42, name: 'site', full_name: 'acme/site', owner: { id: 7, login: 'acme' } }],
    }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const t = await requestInstallationToken({ installationId: 9, permissions: { contents: 'write' }, repositoryIds: [42] })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/app/installations/9/access_tokens')
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ permissions: { contents: 'write' }, repository_ids: [42] })
    expect(t.repositories).toEqual([{ id: 42, name: 'site', fullName: 'acme/site', ownerId: 7, ownerLogin: 'acme' }])
  })

  it('says why GitHub refused', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('There is at least one repository that does not exist', { status: 422 })))
    await expect(requestInstallationToken({ installationId: 9, permissions: { contents: 'read' }, repositoryIds: [1] })).rejects.toBeInstanceOf(GitHubTokenError)
  })
})

describe('revoking', () => {
  it.each([[204, true], [401, true], [500, false]])('answers %i as ended: %s', async (status, ended) => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(null, { status }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await revokeInstallationToken('ghs_dummy')).toBe(ended)
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.github.com/installation/token')
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe('DELETE')
  })
})

const SRC = fileURLToPath(new URL('../../', import.meta.url))

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(p)
    return /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

describe('the one place hq asks GitHub for an installation token', () => {
  it('is installationTokens.ts, reached only from the mint gate', () => {
    const files = sources(SRC)
    expect(files.length).toBeGreaterThan(100)
    const rel = (f: string) => path.relative(SRC, f)
    expect(files.filter((f) => fs.readFileSync(f, 'utf8').includes('access_tokens')).map(rel)).toEqual(['github/installationTokens.ts'])
    expect(files.filter((f) => /from '\.{1,2}\/(?:[\w.]+\/)*installationTokens'/.test(fs.readFileSync(f, 'utf8'))).map(rel).sort())
      .toEqual(['github/mintGate.ts'])
  })

  it('has no cache and no getTokenFor left anywhere', () => {
    const offenders = sources(SRC).filter((f) => /getTokenFor|getOrgToken|tokenCache/.test(fs.readFileSync(f, 'utf8')))
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([])
  })
})
