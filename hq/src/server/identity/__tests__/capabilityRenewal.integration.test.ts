/**
 * Capability renewal (§2a) against the real test database: the site
 * authenticates with its own machine credential, presents its current
 * capability, and gets a fresh one re-resolved from live rows — never one
 * audienced to another site, never a different runner, never a guess at what
 * started the run (@SC-273, @SC-312, adr-0087).
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../storage/workspaceStore')>()
  return { ...actual, getWorkspace: vi.fn() }
})

import { resolveCapabilityClaims, renewCapability } from '../capabilityService'
import { ensureHqSigningKey } from '../signingKeyService'
import { mintIdentityToken, signCapability, verifyHqToken } from '../tokenService'
import { renewCapabilityHandler } from '../identityApi'
import { getWorkspace, SiteUnreachableError } from '../../../storage/workspaceStore'
import { hashCredential } from '../../../sites/credentials'
import { agent, chatSession, chatLoc, seedOrganisation, seedPersonalProject, site } from './capabilityFixtures'

const CREDENTIAL = 'smc_machine_credential'
const SITE_HEADERS = { authorization: `Bearer ${CREDENTIAL}`, 'x-site-id': 'site-1' }
const RUNNER = { kind: 'person', userId: 'u1' } as const

function response() {
  // `any`: the handler answers several JSON shapes, which the tests read field by field.
  const r = { code: 200, body: undefined as any, status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b; return r } }
  return r
}
// The Wasp API type wants Express's request and response; these pass the fields the handler reads.
async function renew(body: unknown, headers: Record<string, string> = SITE_HEADERS) {
  const r = response()
  await (renewCapabilityHandler as unknown as (req: unknown, res: unknown, ctx: unknown) => Promise<void>)({ headers, body }, r, {})
  return r
}

/** The capability a run in the stored chat session holds right now. */
async function currentCapability(change: (claims: CapabilityClaims) => object = (c) => c) {
  const claims = await resolveCapabilityClaims({ agent, session: chatSession, primaryLoc: chatLoc, taskId: null, startedBy: 'person' })
  return (await signCapability(change(claims) as Omit<CapabilityClaims, 'tokenType'>)).token
}

beforeEach(async () => {
  vi.mocked(getWorkspace).mockImplementation((async (id: string) => ({ id, allowedTools: null })) as never)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  await seedOrganisation()
  await prisma.executionSite.update({ where: { siteId: 'site-1' }, data: { credentialHash: hashCredential(CREDENTIAL) } })
  await ensureHqSigningKey()
})

describe('the renewal endpoint authenticates the site and the capability @SC-312', () => {
  it.each([
    ['no Authorization', { 'x-site-id': 'site-1' }],
    ['no X-Site-Id', { authorization: `Bearer ${CREDENTIAL}` }],
    ['a wrong machine credential', { authorization: 'Bearer smc_wrong', 'x-site-id': 'site-1' }],
    ["another site's id", { authorization: `Bearer ${CREDENTIAL}`, 'x-site-id': 'site-2' }],
  ])('401s with %s, even with a valid capability', async (_what, headers) => {
    const r = await renew({ capability: await currentCapability() }, headers)
    expect(r.code).toBe(401)
    expect(r.body).toEqual({ error: 'unauthorized' })
  })

  it.each([
    ['missing', {}],
    ['not a string', { capability: 42 }],
  ])('400s when the body capability is %s', async (_what, body) => {
    expect((await renew(body)).code).toBe(400)
  })

  it('401s a garbage or tampered token', async () => {
    const token = await currentCapability()
    for (const capability of ['not-a-real-token', token.slice(0, -3) + 'xxx']) {
      expect(await renew({ capability })).toMatchObject({ code: 401, body: { error: 'unauthorized' } })
    }
  })

  it("401s a capability minted for a different site's audience, even presented by a registered site", async () => {
    const r = await renew({ capability: await currentCapability((c) => ({ ...c, siteId: 'site-2' })) })
    expect(r).toMatchObject({ code: 401, body: { error: 'unauthorized' } })
  })

  it('401s an identity token presented as a capability — the type pin is load-bearing', async () => {
    const { token } = await mintIdentityToken({ userId: 'u1', role: 'ADMIN', orgId: null, siteId: 'site-1' })
    expect(await renew({ capability: token })).toMatchObject({ code: 401, body: { error: 'unauthorized' } })
  })
})

describe('capability renewal @SC-273', () => {
  it('renews a valid capability: the fresh one verifies for this site, carries the same runner, and lasts about 900 s', async () => {
    const r = await renew({ capability: await currentCapability() })
    expect(r.code).toBe(200)
    const payload = await verifyHqToken(r.body.capability, 'capability', 'site-1')
    expect(payload).toMatchObject({ sessionId: 's1', runner: RUNNER, startedBy: 'person' })
    expect(r.body.expiresAt).toBeGreaterThan(Date.now() + 890_000)
    expect(r.body.expiresAt).toBeLessThan(Date.now() + 910_000)
  })

  it('carries what started the run into the renewal unchanged (adr-0087)', async () => {
    const r = await renew({ capability: await currentCapability((c) => ({ ...c, startedBy: 'pulse' })) })
    expect((await verifyHqToken(r.body.capability, 'capability', 'site-1')).startedBy).toBe('pulse')
  })

  it("carries the run's person into the renewal unchanged, and never adds one @SC-520", async () => {
    const r = await renew({ capability: await currentCapability((c) => ({ ...c, onBehalfOfUserId: 'u-sender' })) })
    expect((await verifyHqToken(r.body.capability, 'capability', 'site-1')).onBehalfOfUserId).toBe('u-sender')
    const bare = await renew({ capability: await currentCapability() })
    expect(await verifyHqToken(bare.body.capability, 'capability', 'site-1')).not.toHaveProperty('onBehalfOfUserId')
  })

  it.each([
    ['does not say what started its run', (c: CapabilityClaims) => { const { startedBy: _s, ...rest } = c; return rest }],
    ['names no runner', (c: CapabilityClaims) => { const { runner: _r, ...rest } = c; return rest }],
  ])('410s a capability that %s, rather than guessing', async (_what, drop) => {
    expect((await renew({ capability: await currentCapability(drop) })).code).toBe(410)
  })

  it('410s when the session behind a valid capability no longer exists', async () => {
    const capability = await currentCapability()
    await prisma.agentSession.delete({ where: { id: 's1' } })
    expect(await renew({ capability })).toMatchObject({ code: 410, body: { error: 'Capability cannot be renewed' } })
  })

  it("410s a chat in a deleted project's workspace — the placement survives the project, the renewal must not", async () => {
    await prisma.agentSession.update({ where: { id: 's1' }, data: { primaryOwnerType: 'project', primaryOwnerId: 'p-gone' } })
    const capability = await currentCapability()
    await expect(renewCapability({ sessionId: 's1', agentId: 'a1', taskId: null, runner: RUNNER, startedBy: 'person' })).rejects.toThrow('no longer exists')
    expect((await renew({ capability })).code).toBe(410)
  })

  // A site momentarily offline is transient: 410 would tell the runtime the session is over.
  it('503s, naming the site, when a read the renewal needs finds the site unreachable', async () => {
    const capability = await currentCapability()
    vi.mocked(getWorkspace).mockRejectedValue(new SiteUnreachableError('Box One', 'site-1'))
    const r = await renew({ capability })
    expect(r.code).toBe(503)
    expect(r.body.error).toContain('Box One')
  })

  it('410s, and hands back nothing, when the storage has moved to another site since the mint', async () => {
    const capability = await currentCapability()
    const other = await site('site-2')
    await prisma.workspacePlacement.update({ where: { workspaceId: 'w1' }, data: { siteId: other.id } })

    const r = await renew({ capability })

    expect(r).toMatchObject({ code: 410, body: { error: 'Capability cannot be renewed' } })
    expect(JSON.stringify(r.body)).not.toContain('site-2')
  })
})

describe('renewCapability re-resolves from live rows', () => {
  it('refuses to renew into a different runner than the capability names', async () => {
    await expect(renewCapability({ sessionId: 's1', agentId: 'a1', taskId: null, runner: { kind: 'person', userId: 'someone-else' }, startedBy: 'person' }))
      .rejects.toThrow('runner no longer matches')
  })

  it("keeps the invoker's role on a chat renewal rather than silently downgrading to unattended", async () => {
    await prisma.userSettings.create({ data: { userId: 'u1', role: 'ADMIN' } })
    const { token } = await renewCapability({ sessionId: 's1', agentId: 'a1', taskId: null, runner: RUNNER, startedBy: 'person' })
    expect((await verifyHqToken(token, 'capability', 'site-1')).role).toBe('ADMIN')
  })

  it('carries what started the run, so an automated run never renews into a person-started one', async () => {
    const { token, claims } = await renewCapability({ sessionId: 's1', agentId: 'a1', taskId: null, runner: RUNNER, startedBy: 'schedule' })
    expect(claims.startedBy).toBe('schedule')
    expect((await verifyHqToken(token, 'capability', 'site-1')).startedBy).toBe('schedule')
  })

  it("re-resolves the site from the session's location, so a placement change reaches a live run", async () => {
    const moved = await site('site-moved-to')
    await prisma.workspacePlacement.update({ where: { workspaceId: 'w1' }, data: { siteId: moved.id } })
    const { token } = await renewCapability({ sessionId: 's1', agentId: 'a1', taskId: null, runner: RUNNER, startedBy: 'person' })
    expect((await verifyHqToken(token, 'capability', 'site-moved-to')).siteId).toBe('site-moved-to')
  })

  it("picks up a change to the agent's tools made since the mint", async () => {
    await prisma.agent.update({ where: { id: 'a1' }, data: { allowedTools: [{ name: 'read_file', state: 'never' }] } })
    const { claims } = await renewCapability({ sessionId: 's1', agentId: 'a1', taskId: null, runner: RUNNER, startedBy: 'person' })
    expect(claims.permissions.neverTools).toContain('read_file')
  })

  it("renews a personal project's task to the same person runner, never a project one", async () => {
    const site1 = await prisma.executionSite.findUniqueOrThrow({ where: { siteId: 'site-1' } })
    await seedPersonalProject('u1', site1.id)
    await prisma.agentSession.create({
      data: { id: 's-mine', userId: 'u1', agentId: 'a1', sessionType: 'task', taskId: 't-mine', primaryOwnerType: 'user', primaryOwnerId: 'u1' },
    })
    const { claims } = await renewCapability({ sessionId: 's-mine', agentId: 'a1', taskId: 't-mine', runner: RUNNER, startedBy: 'person' })
    expect(claims).toMatchObject({ runner: RUNNER, projectId: 'p-mine' })
  })
})
