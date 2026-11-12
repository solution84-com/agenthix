import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { serialize } from 'wasp/core/serialization'

vi.mock('wasp/server', () => import('./guardDb'))
const lookups = vi.hoisted(() => ({ count: 0 }))
vi.mock('wasp/auth/session', () => ({
  getSessionAndUserFromBearerToken: async (req: Request) => {
    lookups.count += 1
    return req.headers.authorization === 'Bearer visitor-session' ? { session: { id: 's' }, user: { id: 'visitor-1' } } : null
  },
}))

import { counted, demoGuard, refusedInDemo, SMALL_READ_BYTES } from '../demoGuard'
import { FROM_LINK_OPERATIONS, REFUSED_OPERATIONS } from '../refused'
import { DEMO_BYTES, VISITOR_BYTES } from '../storageBudget'
import { forgetVisitorsForTests } from '../visitorOf'
import { DEMO_REFUSAL, setDemoModeForTests } from '../../demoMode'
import { DEMO_FULL_STORAGE, DEMO_VISITOR_STORAGE } from '../../demoWords'
import { db } from './guardDb'

const op = (name: string) => `/operations/${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}`
const call = (name: string, args: unknown = {}) => refusedInDemo('POST', op(name), serialize(args))

beforeEach(() => {
  db.counts.clear()
  forgetVisitorsForTests()
  lookups.count = 0
})
afterEach(() => setDemoModeForTests(null))

describe("the demo guard's list @SC-1967", () => {
  const generated = path.resolve(__dirname, '../../../../.wasp/out/server/src')
  const names = (dir: string) =>
    fs.readdirSync(path.join(generated, dir)).filter(f => f.endsWith('.ts') && f !== 'index.ts').map(f => f.slice(0, -3))

  it('names only operations Wasp generated, each once, so one renamed later fails here', () => {
    const operations = new Set([...names('actions'), ...names('queries')])
    const listed = [...Object.values(REFUSED_OPERATIONS).flat(), ...FROM_LINK_OPERATIONS]
    expect(listed.filter((n, i) => listed.indexOf(n) !== i)).toEqual([])
    expect(listed.filter(n => !operations.has(n))).toEqual([])
  })
})

describe('the demo guard refuses @SC-1967', () => {
  it.each([
    // What a member may do that reaches outside: their own Claude sign-in, a vendor's voice, a summary by a model.
    'startClaudeLogin', 'completeClaudeLogin', 'removeMyClaudeSubscription', 'getSpeechToken', 'previewVoice',
    'summariseConversation', 'addPlaceSecret', 'connectRepo', 'createConnection',
    // Who can get in, and a phone's pairing.
    'createInvite', 'generateMobileAuthToken', 'exchangeMobileAuthToken', 'signOutPhone',
    // A workflow or a live preview, which needs a container.
    'startWorkflowRun', 'switchWorkflow', 'startLivePreview',
    // A project every visitor would see.
    'createProject',
  ])('the operation %s', (name) => {
    expect(call(name)).toBe(true)
  })

  it.each(['listInworldVoices', 'getWorkflows', 'getRepoSecrets', 'getGitHubInstallLink'])('the query %s, which asks outside', (name) => {
    expect(call(name)).toBe(true)
  })

  it.each([
    '/auth/username/login', '/auth/username/signup', '/api/auth/change-password', '/api/auth/accept-invite',
    '/api/auth/password-reset', '/api/auth/cloud/start', '/api/auth/cloud/finish', '/api/mobile/register-session',
    '/mcp', '/api/v1/sites/leave', '/api/v1/hosts/leave', '/api/v1/move-check', '/api/v1/cloud/ai-token',
    '/api/auth/site-token', '/anything/new',
  ])('the write %s: a password change, signing in and every other write outside the operations', (url) => {
    expect(refusedInDemo('POST', url, {})).toBe(true)
  })

  it('the GitHub App registration, even as a read @SC-1968', () => {
    expect(refusedInDemo('GET', '/api/v1/github/app-manifest-new', undefined)).toBe(true)
  })

  it('a path written another way that Express would still route @SC-1968', () => {
    expect(refusedInDemo('POST', '/OPERATIONS/Create-Invite/', {})).toBe(true)
    expect(refusedInDemo('POST', '/auth//username/login/?x=1', {})).toBe(true)
    expect(refusedInDemo('POST', '/operations/create%2Dinvite', {})).toBe(true)
    expect(refusedInDemo('POST', '/auth/username/%E0%A4%A', {})).toBe(true)
  })

  it('a package from a link, as an action or a query, read as Wasp reads it @SC-1968', () => {
    expect(call('installAsset', { from: 'url', link: 'https://example.com/p.zip', at: new Date() })).toBe(true)
    expect(call('getPackageFiles', { from: 'url', link: 'https://example.com/p.zip' })).toBe(true)
    expect(call('installAsset', { from: 'shelf', name: 'x' })).toBe(false)
  })

  it("any operation whose body copies one value onto another (superjson's referentialEqualities) @SC-1968", () => {
    const meta = { referentialEqualities: { a: ['b'] } }
    expect(refusedInDemo('POST', op('createTask'), { json: { a: {}, b: {} }, meta })).toBe(true)
    expect(refusedInDemo('POST', op('getAgents'), { json: { a: {}, b: {} }, meta })).toBe(true)
    // A link hidden behind a copy is refused with it.
    expect(refusedInDemo('POST', op('installAsset'), { json: { from: 'shelf', x: 'url' }, meta: { referentialEqualities: { x: ['from'] } } })).toBe(true)
  })
})

describe('the demo guard leaves the rest to the product @SC-1967 @SC-1968', () => {
  it.each([
    'createTask', 'moveTask', 'deleteTask', 'updateProject', 'deleteProject', 'addTaskComment', 'sendConversationMessage',
    'startConversation', 'runTask', 'startAllAgents', 'saveKnowledgePage', 'deleteKnowledgePage', 'uploadTaskAttachment',
    'setPersonName', 'updateOrg', 'setFeature', 'madeUpLater',
  ])('the operation %s', (name) => {
    expect(call(name)).toBe(false)
  })

  it.each([['GET', '/api/v1/anything'], ['GET', '/auth/me'], ['OPTIONS', '/operations/create-invite'],
    ['POST', '/auth/logout'], ['POST', '/api/demo/enter'], ['POST', '/api/v1/data']])(
    '%s %s', (method, url) => {
      expect(refusedInDemo(method, url, {})).toBe(false)
    })
})

type Answer = { status: number | null; body: unknown; passed: boolean; finish: (status: number) => void }

/** The request through the guard; `finish` then ends the operation's answer with a status, as Express would. */
async function through(name: string, json: unknown, session: string | null = 'visitor-session', url = op(name)): Promise<Answer> {
  const finished: Array<() => void> = []
  const res = {
    statusCode: 200,
    status(code: number) { answer.status = code; return this },
    json(b: unknown) { answer.body = b; done(); return this },
    on(event: string, fn: () => void) { if (event === 'finish') finished.push(fn); return this },
  }
  const answer: Answer = { status: null, body: null, passed: false, finish: (status) => {
    res.statusCode = status
    for (const fn of finished) fn()
  } }
  let done = () => {}
  await new Promise<void>((resolve) => {
    done = resolve
    const headers = session === null ? {} : { authorization: `Bearer ${session}` }
    const req = { method: 'POST', originalUrl: url, body: { json }, headers }
    demoGuard(req as unknown as Request, res as unknown as Response, (() => { answer.passed = true; resolve() }) as NextFunction)
  })
  return answer
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const spent = () => [...db.counts.keys()].filter(k => k.startsWith('demo-bytes:'))

describe('the demo guard as middleware @SC-1969', () => {
  it('answers a refusal with one sentence and marks it as the demo’s', async () => {
    setDemoModeForTests(true)
    expect(await through('createInvite', {})).toMatchObject({ status: 403, passed: false, body: { message: DEMO_REFUSAL, demo: true } })
    expect((await through('getAgents', {})).passed).toBe(true)
  })

  it('passes everything with the setting off @SC-1979', async () => {
    setDemoModeForTests(false)
    for (const name of ['createInvite', 'startWorkflowRun', 'createProject', 'madeUpLater']) {
      expect((await through(name, {})).passed, name).toBe(true)
    }
    expect((await through('x', {}, null, '/auth/username/login')).passed).toBe(true)
    expect((await through('x', {}, null, '/mcp')).passed).toBe(true)
    expect(spent()).toEqual([])
  })
})

describe('the storage budgets @SC-1970', () => {
  const file = (bytes: number) => ({ taskId: 'mine', data: 'a'.repeat(bytes) })

  it('count nothing without a session, so a flood with no account cannot use up the demo; Wasp answers it', async () => {
    setDemoModeForTests(true)
    for (const session of [null, 'not-a-session']) {
      expect((await through('uploadTaskAttachment', file(1_000_000), session)).passed).toBe(true)
    }
    expect(spent()).toEqual([])
  })

  it('look a header that is not a session up once, not on every request', async () => {
    setDemoModeForTests(true)
    for (let i = 0; i < 10; i++) await through('getAgents', {}, 'not-a-session')
    expect(lookups.count).toBe(1)
  })

  it('give back the bytes of an operation that answers 400 or above, and keep those of one that succeeds', async () => {
    setDemoModeForTests(true)
    const failed = await through('uploadTaskAttachment', file(5_000))
    expect(failed.passed).toBe(true)
    expect(db.counts.get('demo-bytes:all')).toBeGreaterThan(5_000)
    failed.finish(404)
    await settle()
    expect(db.counts.get('demo-bytes:all')).toBe(0)
    expect(db.counts.get('demo-bytes:visitor-1')).toBe(0)

    const stored = await through('uploadTaskAttachment', file(5_000))
    stored.finish(200)
    await settle()
    expect(db.counts.get('demo-bytes:visitor-1')).toBeGreaterThan(5_000)
  })

  it(`keep ${VISITOR_BYTES} bytes from a visitor, then say so and give the refused bytes back`, async () => {
    setDemoModeForTests(true)
    expect((await through('uploadTaskAttachment', file(VISITOR_BYTES - 1_000))).passed).toBe(true)
    expect(await through('uploadTaskAttachment', file(2_000))).toMatchObject({
      status: 403, passed: false, body: { message: DEMO_VISITOR_STORAGE, demo: true },
    })
    expect(db.counts.get('demo-bytes:visitor-1')).toBeLessThan(VISITOR_BYTES)
    expect((await through('uploadTaskAttachment', file(100))).passed).toBe(true)
  })

  it(`stop everyone once visitors together sent ${DEMO_BYTES} bytes`, async () => {
    setDemoModeForTests(true)
    db.counts.set('demo-bytes:all', DEMO_BYTES - 10)
    expect(await through('createTask', { title: 'a task with a long enough name' })).toMatchObject({
      status: 403, body: { message: DEMO_FULL_STORAGE },
    })
  })

  it('count every action and any large body, but not a small read', async () => {
    expect(counted('createTask', 10)).toBe(true)
    expect(counted('getAgents', 10)).toBe(false)
    expect(counted('getAgents', SMALL_READ_BYTES + 1)).toBe(true)
    expect(counted('getting', 10)).toBe(true)
    setDemoModeForTests(true)
    expect((await through('getAgents', {})).passed).toBe(true)
    expect(spent()).toEqual([])
  })

  it('mark the visitor active as they use the demo', async () => {
    setDemoModeForTests(true)
    await through('getAgents', {})
    expect(db.counts.has('demo-seen:visitor-1')).toBe(true)
  })
})
