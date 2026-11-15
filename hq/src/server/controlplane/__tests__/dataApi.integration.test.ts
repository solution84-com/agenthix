/**
 * /api/v1/data end-to-end against the real test database (ADR-0035, spec §7.2,
 * plan 5b-2 task 5). Exercises the whole chain dataApi.test.ts's mocked unit
 * suite cannot: a real registered site's machine credential via
 * registrationService, a real hq-signed capability via tokenService, and a
 * real control-plane op (get_task_details) reading the real test DB.
 *
 * The load-bearing scenario is the audience pin itself (@SC-307/@SC-308):
 * a task-minted capability scopes a run to one project (spec §H2), and this
 * endpoint additionally pins the capability's `siteId` audience to the
 * X-Site-Id the caller just authenticated as with its machine credential.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUser, createAgent, createProject, createTestTask } from '../../../test/factories'

vi.mock('wasp/server', () => ({
  prisma,
  HttpError: class HttpError extends Error {
    statusCode: number
    constructor(statusCode: number, message?: string) {
      super(message)
      this.statusCode = statusCode
    }
  },
}))

import { dataHandler } from '../dataApi'
import { generateCredential, hashCredential } from '../../../sites/credentials'
import { MACHINE_CREDENTIAL_PREFIX } from '@agenthix/core'
import { signCapability } from '../../identity/tokenService'
import { ensureHqSigningKey } from '../../identity/signingKeyService'
import type { CapabilityClaims } from '@agenthix/core'

function makeReqRes(headers: Record<string, string>, body: unknown) {
  const res: any = { statusCode: 200, body: undefined }
  res.status = vi.fn((code: number) => { res.statusCode = code; return res })
  res.json = vi.fn((payload: unknown) => { res.body = payload; return res })
  const req = { headers, body } as any
  return { req, res }
}

async function registerSite(siteId: string, adminUserId: string) {
  const { value } = generateCredential(MACHINE_CREDENTIAL_PREFIX)
  await prisma.executionSite.create({
    data: { siteId, label: 'Test Site', status: 'REGISTERED', credentialHash: hashCredential(value), createdById: adminUserId },
  })
  return value
}

async function makeTask(projectId: string, onBehalfOfUserId = 'user-placeholder') {
  return createTestTask({
    data: { title: 'Integration task', projectId, number: 1, onBehalfOfUserId },
  })
}

function baseCapability(overrides: Partial<Omit<CapabilityClaims, 'tokenType'>>): Omit<CapabilityClaims, 'tokenType'> {
  return {
    userId: 'user-placeholder',
    runner: { kind: 'person', userId: 'user-placeholder' }, startedBy: 'person' as const,
    agentId: 'agent-placeholder',
    sessionId: 'session-1',
    projectId: null,
    workspaceId: null,
    taskId: null,
    role: null,
    siteId: 'site-placeholder',
    permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
    ...overrides,
  }
}

describe('POST /api/v1/data — machine credential + audience-pinned capability @SC-307 @SC-308', () => {
  beforeEach(async () => {
    await ensureHqSigningKey()
  })

  it('a task-minted capability reaches its own project\'s task (200, result has the task)', async () => {
    await prisma.org.create({ data: { name: 'Test Org' } })
    const admin = await createUser()
    const agent = await createAgent()
    const project1 = await createProject()
    // The run is checked against its task's person, who must be a member (adr-0101).
    const person = await createUser()
    await prisma.projectMember.create({ data: { projectId: project1.id, userId: person.id } })
    const task1 = await makeTask(project1.id, person.id)

    const siteId = 'site-int-a'
    const machineCredential = await registerSite(siteId, admin.id)

    const { token: capabilityJwt } = await signCapability(baseCapability({
      userId: admin.id, runner: { kind: 'project', projectId: project1.id }, startedBy: 'person' as const, agentId: agent.id, taskId: task1.id, projectId: project1.id, siteId,
    }))

    const { req, res } = makeReqRes(
      {
        authorization: `Bearer ${machineCredential}`,
        'x-site-id': siteId,
        'x-run-capability': capabilityJwt,
      },
      { operation: 'get_task_details', args: { taskId: task1.id } },
    )

    await dataHandler(req, res, {} as any)

    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ result: { taskId: task1.id } })
  })

  it('the same capability is refused for a task in a different project (403)', async () => {
    await prisma.org.create({ data: { name: 'Test Org' } })
    const admin = await createUser()
    const agent = await createAgent()
    const project1 = await createProject()
    const project2 = await createProject()
    await makeTask(project1.id)
    const task2 = await makeTask(project2.id)

    const siteId = 'site-int-b'
    const machineCredential = await registerSite(siteId, admin.id)

    const { token: capabilityJwt } = await signCapability(baseCapability({
      userId: admin.id, runner: { kind: 'project', projectId: project1.id }, startedBy: 'person' as const, agentId: agent.id, taskId: task2.id, projectId: project1.id, siteId,
    }))

    const { req, res } = makeReqRes(
      {
        authorization: `Bearer ${machineCredential}`,
        'x-site-id': siteId,
        'x-run-capability': capabilityJwt,
      },
      { operation: 'get_task_details', args: { taskId: task2.id } },
    )

    await dataHandler(req, res, {} as any)

    expect(res.statusCode).toBe(403)
  })

  it('a capability minted for a different site\'s audience is refused (401)', async () => {
    await prisma.org.create({ data: { name: 'Test Org' } })
    const admin = await createUser()
    const agent = await createAgent()
    const project1 = await createProject()
    const task1 = await makeTask(project1.id)

    const siteId = 'site-int-c'
    const otherSiteId = 'site-int-c-other'
    const machineCredential = await registerSite(siteId, admin.id)

    const { token: capabilityJwt } = await signCapability(baseCapability({
      userId: admin.id, runner: { kind: 'project', projectId: project1.id }, startedBy: 'person' as const, agentId: agent.id, taskId: task1.id, projectId: project1.id, siteId: otherSiteId,
    }))

    const { req, res } = makeReqRes(
      {
        authorization: `Bearer ${machineCredential}`,
        'x-site-id': siteId,
        'x-run-capability': capabilityJwt,
      },
      { operation: 'get_task_details', args: { taskId: task1.id } },
    )

    await dataHandler(req, res, {} as any)

    expect(res.statusCode).toBe(401)
  })
})
