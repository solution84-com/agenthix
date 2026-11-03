/**
 * POST /api/v1/data's decision tree (spec §7.2, @SC-307) against the real test
 * database: who may call (a registered site's machine credential plus a
 * capability audienced to that site), what may be called (an operation the
 * schemas know, with arguments they accept and nothing more), and what comes
 * back — the operation's result, a mapped refusal, or a generic failure that
 * names nothing internal.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { prisma } from '../../../test/db'
import { createAgent, createProject, createTestTask, createUserWithRole } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))

import { dataHandler } from '../dataApi'
import { signCapability } from '../../identity/tokenService'
import { ensureHqSigningKey } from '../../identity/signingKeyService'
import { hashCredential } from '../../../sites/credentials'

const SITE = 'site-data'
const CREDENTIAL = 'smc_data_credential'

function response() {
  // `any`: the handler answers several JSON shapes, which the tests read field by field.
  const r = { code: 200, body: undefined as any, status(c: number) { r.code = c; return r }, json(b: unknown) { r.body = b; return r } }
  return r
}
// The Wasp API type wants Express's request and response; these pass the fields the handler reads.
async function call(headers: Record<string, string>, body: unknown) {
  const r = response()
  await (dataHandler as unknown as (req: unknown, res: unknown, ctx: unknown) => Promise<void>)({ headers, body }, r, {})
  return r
}

let user: { id: string }
let agentId: string
let project: { id: string }
let task: { id: string }

async function capability(over: Partial<Omit<CapabilityClaims, 'tokenType'>> = {}) {
  return (await signCapability({
    userId: user.id, runner: { kind: 'project', projectId: project.id }, startedBy: 'person', agentId, sessionId: 's1',
    projectId: project.id, workspaceId: null, taskId: task.id, role: null, siteId: SITE,
    permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
    ...over,
  })).token
}
async function headers(over: Partial<Omit<CapabilityClaims, 'tokenType'>> = {}) {
  return { authorization: `Bearer ${CREDENTIAL}`, 'x-site-id': SITE, 'x-run-capability': await capability(over) }
}

beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await ensureHqSigningKey()
  await prisma.executionSite.create({ data: { siteId: SITE, label: 'Data site', credentialHash: hashCredential(CREDENTIAL) } })
  // Every call is checked against the run's person (adr-0101): an admin, a member of the project, whose chat s1 is.
  user = await createUserWithRole('ADMIN')
  agentId = (await createAgent()).id
  project = await createProject()
  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id } })
  await prisma.agentSession.create({ data: { id: 's1', userId: user.id, agentId, sessionType: 'chat' } })
  task = await createTestTask({ data: { title: 'A task', projectId: project.id, number: 1, onBehalfOfUserId: user.id } })
})

describe('data endpoint authentication @SC-307', () => {
  it.each([
    ['no Authorization', (h: Record<string, string>) => ({ ...h, authorization: '' })],
    ['no X-Site-Id', (h: Record<string, string>) => ({ ...h, 'x-site-id': '' })],
    ['a wrong machine credential', (h: Record<string, string>) => ({ ...h, authorization: 'Bearer smc_wrong' })],
    ['no X-Run-Capability', (h: Record<string, string>) => ({ ...h, 'x-run-capability': '' })],
    ['a tampered capability', (h: Record<string, string>) => ({ ...h, 'x-run-capability': h['x-run-capability'].slice(0, -3) + 'xxx' })],
  ])('401s with %s, and runs nothing', async (_what, alter) => {
    const r = await call(alter(await headers()), { operation: 'get_task_details', args: { taskId: task.id } })
    expect(r).toMatchObject({ code: 401, body: { error: 'unauthorized' } })
  })

  it('401s a revoked site, whatever capability it presents', async () => {
    const h = await headers()
    await prisma.executionSite.update({ where: { siteId: SITE }, data: { status: 'REVOKED' } })
    expect((await call(h, { operation: 'get_task_details', args: { taskId: task.id } })).code).toBe(401)
  })
})

describe('what may be called', () => {
  it.each([
    ['missing', {}],
    ['not a string', { operation: 42 }],
  ])('400s when the operation is %s', async (_what, body) => {
    expect((await call(await headers(), body)).code).toBe(400)
  })

  it.each(['constructor', '__proto__', 'not_a_real_operation'])('404s the unknown operation %s', async (operation) => {
    const r = await call(await headers(), { operation, args: {} })
    expect(r.code).toBe(404)
    expect(r.body.error).toContain(operation)
  })

  it.each([
    ['no args at all — the schema requires taskId', undefined],
    ['non-object args', 'task-1'],
  ])('400s get_task_details with %s', async (_what, args) => {
    expect((await call(await headers(), { operation: 'get_task_details', args })).code).toBe(400)
  })

  // Review C1: an undeclared key used to ride into a Prisma write as a nested relation write.
  it("strips a key create_product's schema does not declare before it reaches the database", async () => {
    const r = await call(await headers({ role: 'ADMIN', projectId: null, taskId: null, runner: { kind: 'person', userId: user.id } }), {
      operation: 'create_product',
      args: { name: 'P', slug: 'p', projects: { connect: [{ id: project.id }] } },
    })
    expect(r.code).toBe(200)
    const product = await prisma.product.findUniqueOrThrow({ where: { slug: 'p' }, include: { projects: true } })
    expect(product.projects).toEqual([])
  })
})

describe('what comes back', () => {
  it('the operation result, for a capability acting in its own project', async () => {
    const r = await call(await headers(), { operation: 'get_task_details', args: { taskId: task.id } })
    expect(r).toMatchObject({ code: 200, body: { result: { taskId: task.id, title: 'A task' } } })
  })

  it.each([
    ['403 for a refusal', async () => (await createTestTask({ data: { title: 'x', projectId: (await createProject()).id, number: 1, onBehalfOfUserId: 'p' } })).id, 403],
    ['404 for something that does not exist', async () => 'no-such-task', 404],
  ])('maps a control-plane error to %s, with its message', async (_what, taskId, code) => {
    const r = await call(await headers(), { operation: 'get_task_details', args: { taskId: await taskId() } })
    expect(r.code).toBe(code)
    expect(typeof r.body.error).toBe('string')
  })

  it("maps an operation's invalid request to 400 with the explanation", async () => {
    await prisma.task.update({ where: { id: task.id }, data: { runState: 'RUN_ACTIVE' } })
    const r = await call(await headers(), { operation: 'archive_task', args: { taskId: task.id } })
    expect(r).toMatchObject({ code: 400, body: { error: 'Cannot archive a task that is currently running' } })
  })

  // Review I3: a Prisma failure carries file paths and code excerpts.
  it('500s a duplicate-slug create_product with a generic body that names nothing internal', async () => {
    const h = await headers({ role: 'ADMIN', projectId: null, taskId: null, runner: { kind: 'person', userId: user.id } })
    await call(h, { operation: 'create_product', args: { name: 'P', slug: 'dup' } })
    const r = await call(h, { operation: 'create_product', args: { name: 'P', slug: 'dup' } })
    expect(r).toMatchObject({ code: 500, body: { error: 'internal error' } })
  })

  it('500s an unexpected failure without leaking its message', async () => {
    vi.spyOn(prisma.task, 'findUnique').mockRejectedValueOnce(new Error('db connection reset at 10.0.0.5:5432'))
    const r = await call(await headers(), { operation: 'get_task_details', args: { taskId: task.id } })
    expect(r).toMatchObject({ code: 500, body: { error: 'internal error' } })
  })
})

describe('a capability outliving its project', () => {
  it('403s every call once its project is deleted', async () => {
    const h = await headers()
    await prisma.task.deleteMany()
    await prisma.board.deleteMany({ where: { projectId: project.id } })
    await prisma.project.delete({ where: { id: project.id } })
    const r = await call(h, {
      operation: 'list_products',
      args: {},
    })
    expect(r).toMatchObject({ code: 403, body: { error: "This run's project no longer exists" } })
  })

  it('a capability for a person\'s own storage names no project and is not refused for one', async () => {
    const r = await call(await headers({ projectId: null, taskId: null, role: 'MEMBER', runner: { kind: 'person', userId: user.id } }), {
      operation: 'list_products', args: {},
    })
    expect(r).toMatchObject({ code: 200, body: { result: { products: [] } } })
  })
})
