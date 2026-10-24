import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole } from '../../test/factories'

// Starting a GitHub App registration from inside hq (R-166), against the real
// test database: the caller's role and a connected App are real rows.

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

import { startGithubAppRegistration } from '../githubAppRegistrationAction'
import { clearManifestStates, consumeManifestState, isManifestStateOpen } from '../manifestState'

let admin: { id: string }
const ctx = () => ({ user: admin }) as never

beforeEach(async () => {
  clearManifestStates()
  vi.stubEnv('SECRETS_MASTER_KEY', Buffer.alloc(32, 5).toString('base64'))
  vi.stubEnv('WASP_SERVER_URL', 'https://hq.example.com')
  admin = await createUserWithRole('ADMIN')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

const githubSays = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })))

describe('startGithubAppRegistration (R-166)', () => {
  it('requires the ADMIN role, and a person with no role is refused too (403)', async () => {
    for (const caller of [await createUserWithRole('MEMBER'), await createUser()]) {
      await expect(startGithubAppRegistration({ owner: 'personal' }, { user: caller } as never)).rejects.toMatchObject({ statusCode: 403 })
    }
  })

  it('refuses an unauthenticated caller', async () => {
    await expect(startGithubAppRegistration({ owner: 'personal' }, {} as never)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('returns the manifest page address carrying a one-time state issued to the admin', async () => {
    const { url } = await startGithubAppRegistration({ owner: 'personal' }, ctx())
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://hq.example.com/api/v1/github/app-manifest-new')
    const state = parsed.searchParams.get('state') as string
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(parsed.searchParams.has('org')).toBe(false)
    expect(isManifestStateOpen(state)).toBe(true)
    expect(consumeManifestState(state)).toEqual({ userId: admin.id })
  })

  it('carries a trimmed organisation that GitHub knows as an organisation', async () => {
    githubSays(200, { type: 'Organization' })
    const { url } = await startGithubAppRegistration({ owner: 'organisation', org: '  my-org ' }, ctx())
    expect(new URL(url).searchParams.get('org')).toBe('my-org')
  })

  it('never takes a blank organisation to mean a personal account (400)', async () => {
    await expect(startGithubAppRegistration({ owner: 'organisation', org: '  ' }, ctx())).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/My personal account/) })
    await expect(startGithubAppRegistration({}, ctx())).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses an organisation GitHub does not know, or that is a person, before leaving HQ (400)', async () => {
    githubSays(404, {})
    await expect(startGithubAppRegistration({ owner: 'organisation', org: 'solution84-tst' }, ctx())).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/no organisation called "solution84-tst"/) })
    githubSays(200, { type: 'User' })
    await expect(startGithubAppRegistration({ owner: 'organisation', org: 'lhengl' }, ctx())).rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(/person's GitHub account/) })
  })

  it('goes on when GitHub cannot be asked, leaving the check to GitHub\'s own page', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const { url } = await startGithubAppRegistration({ owner: 'organisation', org: 'my-org' }, ctx())
    expect(new URL(url).searchParams.get('org')).toBe('my-org')
  })

  it('refuses an organisation that is not a GitHub login (400)', async () => {
    await expect(startGithubAppRegistration({ owner: 'organisation', org: 'a/b?x=1' }, ctx())).rejects.toMatchObject({ statusCode: 400 })
  })

  it('refuses while an App is connected, telling the admin to disconnect it first (409)', async () => {
    await prisma.gitHubApp.create({ data: { appId: 1, slug: 's', privateKey: 'k' } })
    await expect(startGithubAppRegistration({ owner: 'personal' }, ctx())).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/disconnect it first/i),
    })
  })

  it('refuses with readable text when hq cannot store secrets', async () => {
    vi.stubEnv('SECRETS_MASTER_KEY', '')
    await expect(startGithubAppRegistration({ owner: 'personal' }, ctx())).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('store secrets') })
  })
})
