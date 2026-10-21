// The GitHub App manifest flow's two endpoints (W-1, W-2), against the real
// test database: the App row is stored and read for real. GitHub itself — the
// code conversion and the installation listing — is the stand-in.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'

const h = vi.hoisted(() => ({
  convertManifestCode: vi.fn(),
  refreshInstallations: vi.fn(),
}))

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../githubApp', async () => {
  const actual = await vi.importActual<typeof import('../githubApp')>('../githubApp')
  return { ...actual, convertManifestCode: h.convertManifestCode, refreshInstallations: h.refreshInstallations }
})

import { appManifestNewHandler, appManifestCallbackHandler } from '../githubAppApi'
import { clearManifestStates, issueManifestState } from '../manifestState'

type FakeRes = {
  statusCode: number
  body: string
  redirectedTo: string | null
  headers: Record<string, string>
  status: (code: number) => FakeRes
  type: (t: string) => FakeRes
  set: (k: string, v: string) => FakeRes
  send: (b: string) => FakeRes
  redirect: (url: string) => void
}

function fakeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    body: '',
    redirectedTo: null,
    headers: {},
    status(code) { res.statusCode = code; return res },
    type(t) { res.headers['Content-Type'] = t; return res },
    set(k, v) { res.headers[k] = v; return res },
    send(b) { res.body = b; return res },
    redirect(url) { res.redirectedTo = url },
  }
  return res
}

const call = async (handler: unknown, query: Record<string, unknown>) => {
  const res = fakeRes()
  await (handler as (req: unknown, res: unknown) => Promise<void>)({ query }, res)
  return res
}

const keyBefore = process.env.SECRETS_MASTER_KEY
beforeEach(() => {
  clearManifestStates()
  process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 5).toString('base64')
  h.convertManifestCode.mockReset().mockResolvedValue({ id: 7, slug: 'agenthix-acme', pem: 'pem' })
  h.refreshInstallations.mockReset().mockResolvedValue(undefined)
})
afterEach(() => {
  if (keyBefore === undefined) delete process.env.SECRETS_MASTER_KEY
  else process.env.SECRETS_MASTER_KEY = keyBefore
})

describe('app-manifest-new (W-2)', () => {
  it('refuses a request with no state (400)', async () => {
    const res = await call(appManifestNewHandler, {})
    expect(res.statusCode).toBe(400)
    expect(res.body).not.toContain('<form')
  })

  it('refuses a state hq did not issue, including a caller-invented one (403)', async () => {
    const res = await call(appManifestNewHandler, { state: 'invented-by-the-caller' })
    expect(res.statusCode).toBe(403)
    expect(res.body).not.toContain('<form')
  })

  it('refuses an expired state (403)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const state = issueManifestState('admin-1')
      vi.advanceTimersByTime(11 * 60 * 1000)
      const res = await call(appManifestNewHandler, { state })
      expect(res.statusCode).toBe(403)
    } finally {
      vi.useRealTimers()
    }
  })

  it('serves the form for a valid state, carrying that state to GitHub, and does not consume it', async () => {
    const state = issueManifestState('admin-1')
    const first = await call(appManifestNewHandler, { state })
    expect(first.statusCode).toBe(200)
    expect(first.body).toContain(`https://github.com/settings/apps/new?state=${encodeURIComponent(state)}`)
    const second = await call(appManifestNewHandler, { state })
    expect(second.statusCode).toBe(200)
  })

  it('posts to the organisation form when an organisation is named', async () => {
    const state = issueManifestState('admin-1')
    const res = await call(appManifestNewHandler, { state, org: 'my org' })
    expect(res.body).toContain('https://github.com/organizations/my%20org/settings/apps/new?state=')
  })
})

describe('app-manifest-callback (W-1)', () => {
  it('refuses a callback with no state and converts nothing (400)', async () => {
    const res = await call(appManifestCallbackHandler, { code: 'abc' })
    expect(res.statusCode).toBe(400)
    expect(res.headers['Content-Type']).toBe('text/plain')
    expect(h.convertManifestCode).not.toHaveBeenCalled()
    expect(await prisma.gitHubApp.count()).toBe(0)
  })

  it('refuses a state hq did not issue and converts nothing (400)', async () => {
    const res = await call(appManifestCallbackHandler, { code: 'abc', state: 'unknown' })
    expect(res.statusCode).toBe(400)
    expect(h.convertManifestCode).not.toHaveBeenCalled()
  })

  it('accepts a valid state, converts the code, stores the App and sends the admin to the install page', async () => {
    const state = issueManifestState('admin-1')
    const res = await call(appManifestCallbackHandler, { code: 'abc', state })
    expect(h.convertManifestCode).toHaveBeenCalledWith('abc')
    expect(await prisma.gitHubApp.findMany()).toEqual([expect.objectContaining({ appId: 7, slug: 'agenthix-acme' })])
    expect(res.redirectedTo).toBe('https://github.com/apps/agenthix-acme/installations/new')
  })

  it('refuses a second use of the same state', async () => {
    const state = issueManifestState('admin-1')
    await call(appManifestCallbackHandler, { code: 'abc', state })
    const again = await call(appManifestCallbackHandler, { code: 'def', state })
    expect(again.statusCode).toBe(400)
    expect(h.convertManifestCode).toHaveBeenCalledTimes(1)
    expect(await prisma.gitHubApp.count()).toBe(1)
  })

  it('a valid state with no code is refused (400) and converts nothing', async () => {
    const state = issueManifestState('admin-1')
    const res = await call(appManifestCallbackHandler, { state })
    expect(res.statusCode).toBe(400)
    expect(h.convertManifestCode).not.toHaveBeenCalled()
  })

  it('refuses while an App is already connected (409), before converting the code', async () => {
    await prisma.gitHubApp.create({ data: { appId: 1, slug: 'existing', privateKey: 'k' } })
    const state = issueManifestState('admin-1')
    const res = await call(appManifestCallbackHandler, { code: 'abc', state })
    expect(res.statusCode).toBe(409)
    expect(res.body).toMatch(/already connected/i)
    expect(h.convertManifestCode).not.toHaveBeenCalled()
    expect((await prisma.gitHubApp.findMany()).map((a) => a.slug)).toEqual(['existing'])
  })

  it('refuses before the code is spent when hq cannot store the private key (503)', async () => {
    delete process.env.SECRETS_MASTER_KEY
    const state = issueManifestState('admin-1')
    const res = await call(appManifestCallbackHandler, { code: 'abc', state })
    expect(res.statusCode).toBe(503)
    expect(h.convertManifestCode).not.toHaveBeenCalled()
  })

  it('reports a failed conversion as plain text (500)', async () => {
    h.convertManifestCode.mockRejectedValue(new Error('<b>boom</b>'))
    const state = issueManifestState('admin-1')
    const res = await call(appManifestCallbackHandler, { code: 'abc', state })
    expect(res.statusCode).toBe(500)
    expect(res.headers['Content-Type']).toBe('text/plain')
    expect(await prisma.gitHubApp.count()).toBe(0)
  })
})
