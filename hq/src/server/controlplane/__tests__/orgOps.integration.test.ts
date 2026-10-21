/**
 * Operations that act on the whole organisation (@SC-306, @SC-309), against
 * the real test database: each is refused to an unattended run and to a
 * caller below its role floor — and then changes nothing — and done for a
 * caller at its floor and for an admin's connection. Also the reads every
 * caller gets the same, and update_org's org package.
 */
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { ORG_ESCAPING_TOOLS, minRoleForOrgEscapingTool, type OrgEscapingTool } from '../../identity/rolePolicy'
import { NO_EXECUTION_SITE_MESSAGE } from '../../../shared/noExecutionSite'
import { prisma } from '../../../test/db'
import { createProject, ensureExecutionSite } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../../sessions/siteRuntimeStore', () => import('../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../agents/dispatchService', () => import('../../../test/fakes/dispatchService'))
// Wrapped, not replaced, so two tests can stage a failed package write inside the real transaction.
vi.mock('../../../packages/orgPackageService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../packages/orgPackageService')>()
  return { ...actual, changeOrgPackage: vi.fn(actual.changeOrgPackage) }
})
// A new project's files are seeded on its site; the site answers as one would.
vi.mock('../../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request: vi.fn(async () => ({})), isOnline: () => true }, ChannelRequestFailed }
})

import { operations, callOperation } from '../operations'
import * as orgOps from '../orgOps'
import * as agentOps from '../agentOps'
import * as productOps from '../productOps'
import { ControlPlaneError } from '../types'
import { changeOrgPackage } from '../../../packages/orgPackageService'
import { PackageContentError, PackageWriteConflictError } from '../../../packages/packageStore'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { runCtx, chatCtx } from './controlPlaneFixtures'

const saved = { storage: process.env.HQ_STORAGE_ROOT, assets: process.env.HQ_ASSETS_ROOT }
let storageRoot: string
beforeAll(async () => {
  storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'org-ops-'))
  process.env.HQ_STORAGE_ROOT = storageRoot
  process.env.HQ_ASSETS_ROOT = path.resolve(process.cwd(), 'assets')
})
afterAll(async () => {
  for (const [key, value] of [['HQ_STORAGE_ROOT', saved.storage], ['HQ_ASSETS_ROOT', saved.assets]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await fs.rm(storageRoot, { recursive: true, force: true })
})

let adminId: string
let viewerId: string
let productId: string
let presetFile: string
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  adminId = (await prisma.user.create({ data: {} })).id
  await prisma.userSettings.create({ data: { userId: adminId, role: 'ADMIN' } })
  await prisma.org.create({ data: { name: 'Old', vision: '', mission: '' } })
  await ensureExecutionSite()
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Agent', handle: 'agent-1' } })
  // A chat run's authority is its person's role as stored (adr-0101): the chat, s1, and a Member to refuse.
  await prisma.agentSession.create({ data: { id: 's1', userId: adminId, agentId: 'agent-1', sessionType: 'chat' } })
  viewerId = (await prisma.user.create({ data: {} })).id
  await prisma.userSettings.create({ data: { userId: viewerId, role: 'MEMBER' } })
  productId = (await prisma.product.create({ data: { name: 'Atlas', slug: 'atlas' } })).id
  presetFile = (await fs.readdir(path.join(process.env.HQ_ASSETS_ROOT!, 'avatars'))).find((f) => /\.(png|jpe?g|webp)$/i.test(f))!
})

const ADMIN_CONNECTION = () => connectionCaller({ userId: adminId, role: 'ADMIN' })

/** For each tool: arguments its op accepts, and whether its effect has happened. */
const CASES: Record<OrgEscapingTool, { args: () => Record<string, unknown>; done: () => Promise<boolean> }> = {
  update_org: { args: () => ({ name: 'New Name' }), done: async () => (await prisma.org.findFirstOrThrow()).name === 'New Name' },
  create_team: { args: () => ({ name: 'Team', purpose: 'p', agentIds: [] }), done: async () => (await prisma.team.count()) === 1 },
  delete_product: { args: () => ({ productId }), done: async () => (await prisma.product.count()) === 0 },
  create_agent: { args: () => ({ name: 'New agent', role: 'r', responsibilities: 'x', handle: 'new-agent' }), done: async () => (await prisma.agent.count({ where: { handle: 'new-agent' } })) === 1 },
  apply_agent_preset: {
    args: () => ({ agentId: 'agent-1', imageType: 'avatar', filename: presetFile }),
    done: async () => (await prisma.agent.findUniqueOrThrow({ where: { id: 'agent-1' } })).avatarUrl !== null,
  },
  // An unknown template: the op answers that it is unknown rather than creating anything — reaching that is the effect.
  propose_workforce_template: { args: () => ({ templateId: 'wft-unknown', reason: 'because' }), done: async () => true },
  create_project: { args: () => ({ name: 'Brand new' }), done: async () => (await prisma.project.count({ where: { name: 'Brand new' } })) === 1 },
  create_product: { args: () => ({ name: 'P', slug: 'p' }), done: async () => (await prisma.product.count({ where: { slug: 'p' } })) === 1 },
  update_product: { args: () => ({ productId, name: 'New' }), done: async () => (await prisma.product.findUniqueOrThrow({ where: { id: productId } })).name === 'New' },
}

describe('org-escaping operations @SC-306 @SC-309', () => {
  describe.each(ORG_ESCAPING_TOOLS)('%s', (tool) => {
    const floor = minRoleForOrgEscapingTool(tool)
    const op = operations[tool]

    it("refuses a run on behalf of no one, and a Member's chat whatever role its capability carries, changing nothing", async () => {
      for (const ctx of [runCtx(null), chatCtx(viewerId, 'ADMIN')]) {
        await expect(op(ctx, CASES[tool].args())).rejects.toBeInstanceOf(ControlPlaneError)
      }
      if (tool !== 'propose_workforce_template') expect(await CASES[tool].done()).toBe(false)
    })

    it(`is done at its floor role (${floor})`, async () => {
      await op(chatCtx(adminId, floor), CASES[tool].args())
      expect(await CASES[tool].done()).toBe(true)
    })

    it("is done for an admin's connection", async () => {
      await op(ADMIN_CONNECTION(), CASES[tool].args())
      expect(await CASES[tool].done()).toBe(true)
    })
  })
})

describe('update_org writes the org package with the row', () => {
  const orgName = async () => (await prisma.org.findFirstOrThrow()).name

  it("stores the org's package, written by the caller", async () => {
    await orgOps.updateOrgOp(chatCtx(adminId, 'ADMIN'), { name: 'New Name' })
    expect(await prisma.package.findFirstOrThrow({ where: { kind: 'ORG' } })).toMatchObject({ updatedById: adminId })
  })

  // The row and the package share one transaction: a failed package write leaves the row as it was.
  it.each([
    ['a refused package as invalid', () => new PackageContentError('bad content'), 'invalid'],
    ['a write conflict as conflict', () => new PackageWriteConflictError('org', 'org-1'), 'conflict'],
  ])('reports %s, and the name is not changed', async (_what, error, code) => {
    vi.mocked(changeOrgPackage).mockRejectedValueOnce(error())
    await expect(orgOps.updateOrgOp(chatCtx(adminId, 'ADMIN'), { name: 'New Name' })).rejects.toMatchObject({ code })
    expect(await orgName()).toBe('Old')
  })
})

// A product groups projects and owns nothing (ADR-0061), so the list is the same for every caller.
describe('list_products is org structure, the same for every caller', () => {
  it('returns every product, never filtered by an agent it names', async () => {
    const result = await productOps.listProductsOp(runCtx(null, { agentId: 'agent-1' }), { agentId: 'agent-argued' })
    expect(result.products).toEqual([expect.objectContaining({ id: productId, name: 'Atlas', slug: 'atlas' })])
    await expect(productOps.listProductsOp(ADMIN_CONNECTION(), {})).resolves.toEqual(result)
  })
})

// Ungated reads: their exact shape is pinned, so a field silently dropped or renamed is caught here.
describe('ungated reads return their pinned shape', () => {
  it('get_org', async () => {
    const org = await prisma.org.update({ where: { id: (await prisma.org.findFirstOrThrow()).id }, data: { name: 'Acme', vision: 'V', mission: 'M' } })
    expect(await orgOps.getOrgOp(ADMIN_CONNECTION(), {})).toEqual({ orgId: org.id, name: 'Acme', vision: 'V', mission: 'M', mode: 'standalone' })
  })

  it('list_teams', async () => {
    const team = await prisma.team.create({ data: { name: 'Team', purpose: 'p', agents: { create: [{ agentId: 'agent-1' }] }, people: { create: [{ userId: adminId }] } } })
    expect(await orgOps.listTeamsOp(ADMIN_CONNECTION(), {})).toEqual({
      teams: [{ teamId: team.id, name: 'Team', purpose: 'p', agentIds: ['agent-1'], userIds: [adminId] }], source: 'local',
    })
  })

  it('list_agents', async () => {
    const result = await agentOps.listAgentsOp(ADMIN_CONNECTION(), {})
    expect(result).toEqual({
      agents: [{ agentId: 'agent-1', name: 'Agent', handle: 'agent-1', runtime: expect.any(String), defaultModel: expect.anything(), isKernel: false }],
      source: 'local',
    })
  })

  it('list_projects', async () => {
    const project = await createProject({ name: 'Proj', description: 'd', defaultAgentId: 'agent-1', accessLevel: 'OPEN' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: adminId } })
    expect(await agentOps.listProjectsOp(ADMIN_CONNECTION(), {})).toEqual({
      projects: [{ projectId: project.id, key: project.key, name: 'Proj', description: 'd', defaultAgentId: 'agent-1' }], source: 'local',
    })
  })

  it('list_presets lists the image files only, in order', async () => {
    const result = await agentOps.listPresetsOp(ADMIN_CONNECTION(), { type: 'avatars' })
    expect(result.type).toBe('avatars')
    expect(result.files).toContain(presetFile)
    expect(result.files.every((f) => /\.(png|jpe?g|webp)$/i.test(f))).toBe(true)
    expect(result.files).toEqual([...result.files].sort())
  })

  it('get_product', async () => {
    expect(await productOps.getProductOp(ADMIN_CONNECTION(), { productId })).toEqual({
      product: expect.objectContaining({ id: productId, name: 'Atlas', slug: 'atlas' }),
    })
  })

  it('get_github_config', async () => {
    expect(await orgOps.getGithubConfigOp(ADMIN_CONNECTION(), {})).toEqual({ configured: false })
  })
})

describe('an operation that needs an Execution Site, with none connected', () => {
  it('reaches the caller as an "unavailable" control-plane error carrying the shared message, nothing created', async () => {
    await prisma.executionSite.updateMany({ data: { status: 'REVOKED' } })
    const err = await callOperation('create_project', ADMIN_CONNECTION(), { name: 'P' }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err).toMatchObject({ code: 'unavailable', message: NO_EXECUTION_SITE_MESSAGE })
    expect(await prisma.project.count({ where: { name: 'P' } })).toBe(0)
  })
})
