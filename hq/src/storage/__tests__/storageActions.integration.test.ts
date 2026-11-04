// The storage actions — creating and deleting a workspace, and its allowed-tools
// cap (@SC-311, @SC-314, @SC-320, @SC-321) — against the real test database:
// roles, projects, sites and hq's own WorkspacePlacement index are real rows.
// What a site holds (its workspace rows and their directories) is a small
// in-memory stand-in, since there is no site in a test process.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LocationFileError } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createAgent, createProject, createUser, createUserWithRole, ensureExecutionSite, joinProjectAs } from '../../test/factories'

type Row = { id: string; name: string; ownerType: 'user' | 'project'; ownerId: string; allowedTools: string[] | null }
const site = vi.hoisted(() => ({ rows: new Map<string, unknown>(), seq: 0, down: false, refuseDir: false }))

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../workspaceStore', async () => {
  const actual = await vi.importActual<typeof import('../workspaceStore')>('../workspaceStore')
  const reach = () => { if (site.down) throw new actual.SiteUnreachableError('Box One', 'site-1') }
  return {
    ...actual,
    createWorkspace: vi.fn(async (_siteId: string, data: Omit<Row, 'id' | 'allowedTools'>) => {
      reach()
      const row = { id: `ws-${++site.seq}`, allowedTools: null, ...data }
      site.rows.set(row.id, row)
      return row
    }),
    getWorkspace: vi.fn(async (id: string) => {
      if (!(await actual.resolvePlacement(id))) return null
      reach()
      return site.rows.get(id) ?? null
    }),
    setWorkspaceAllowedTools: vi.fn(async (id: string, allowedTools: string[] | null) => {
      reach()
      ;(site.rows.get(id) as Row).allowedTools = allowedTools
    }),
    deleteWorkspace: vi.fn(async (id: string) => { reach(); site.rows.delete(id) }),
    deleteWorkspaceAt: vi.fn(async (_siteId: string, id: string) => { site.rows.delete(id) }),
  }
})
vi.mock('../locationFileStore', async () => {
  const actual = await vi.importActual<typeof import('../locationFileStore')>('../locationFileStore')
  return {
    ...actual,
    ensureDirOnSite: vi.fn(async () => {
      if (site.refuseDir) throw new LocationFileError('refused', 'location.ensureDir refused')
      return { created: true }
    }),
  }
})

import { setWorkspaceAllowedToolsAction, createWorkspaceAction, deleteWorkspaceAction } from '../actions'
import { resolveCapabilityClaims } from '../../server/identity/capabilityService'
import { NO_EXECUTION_SITE_MESSAGE } from '../../shared/noExecutionSite'

beforeEach(() => {
  site.rows.clear()
  site.down = false
  site.refuseDir = false
})

const placementOf = (workspaceId: string) => prisma.workspacePlacement.findUnique({ where: { workspaceId } })
const rowOf = (id: string) => site.rows.get(id) as Row | undefined

async function projectWorkspace(callerRole: 'ADMIN' | 'MEMBER' = 'MEMBER') {
  const caller = await createUserWithRole(callerRole)
  const project = await createProject({ accessLevel: 'OPEN' })
  const creator = await createUser()
  await prisma.projectMember.createMany({ data: [caller, creator].map(u => ({ projectId: project.id, userId: u.id })) })
  const { workspaceId } = await createWorkspaceAction({ name: 'web', ownerType: 'project', ownerId: project.id }, { user: creator })
  return { caller: { user: caller }, project, workspaceId }
}

describe('createWorkspaceAction @SC-314 @SC-321 @SC-320', () => {
  it("creates a project's workspace on the project's own site and indexes it there", async () => {
    const s = await ensureExecutionSite()
    const project = await createProject({ accessLevel: 'OPEN', executionSiteId: s.id })

    const creator = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: creator.id } })
    const { workspaceId } = await createWorkspaceAction({ name: ' web ', ownerType: 'project', ownerId: project.id }, { user: creator })

    expect(rowOf(workspaceId)).toMatchObject({ name: 'web', ownerType: 'project', ownerId: project.id })
    expect(await placementOf(workspaceId)).toMatchObject({ siteId: s.id })
  })

  it("places a person's workspace on the default site, always as the caller's own whatever owner id was sent", async () => {
    const s = await ensureExecutionSite()
    const me = await createUser()

    const { workspaceId } = await createWorkspaceAction({ name: 'files', ownerType: 'user', ownerId: 'someone-else' }, { user: me })

    expect(rowOf(workspaceId)).toMatchObject({ ownerType: 'user', ownerId: me.id })
    expect(await placementOf(workspaceId)).toMatchObject({ siteId: s.id })
  })

  it("places a person's workspace on the site their storage is placed on, not the default", async () => {
    await ensureExecutionSite()
    const second = await prisma.executionSite.create({ data: { siteId: `second-${Date.now()}`, label: 'Second', status: 'ONLINE' } })
    const me = await createUser()
    await prisma.userStoragePlacement.create({ data: { userId: me.id, siteId: second.id } })

    const { workspaceId } = await createWorkspaceAction({ name: 'files', ownerType: 'user', ownerId: me.id }, { user: me })

    expect(await placementOf(workspaceId)).toMatchObject({ siteId: second.id })
  })

  it('refuses a project the caller is not on (403), a project with no site (400) and a missing name (400), writing nothing', async () => {
    const me = await createUser()
    const secret = await createProject({ accessLevel: 'PRIVATE' })
    const lonely = await createProject({ accessLevel: 'OPEN', executionSiteId: null })
    await prisma.projectMember.create({ data: { projectId: lonely.id, userId: me.id } })

    await expect(createWorkspaceAction({ name: 'web', ownerType: 'project', ownerId: secret.id }, { user: me })).rejects.toMatchObject({ statusCode: 403 })
    await expect(createWorkspaceAction({ name: 'web', ownerType: 'project', ownerId: lonely.id }, { user: me }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Project has no Execution Site' })
    await expect(createWorkspaceAction({ name: ' ', ownerType: 'user', ownerId: me.id }, { user: me })).rejects.toMatchObject({ statusCode: 400 })
    await expect(createWorkspaceAction({ name: 'web', ownerType: 'user', ownerId: me.id }, {})).rejects.toMatchObject({ statusCode: 401 })

    expect(site.rows.size).toBe(0)
    expect(await prisma.workspacePlacement.count()).toBe(0)
  })

  it('with no Execution Site connected, a person gets the shared error and nothing is written', async () => {
    const me = await createUser()
    await expect(createWorkspaceAction({ name: 'files', ownerType: 'user', ownerId: me.id }, { user: me }))
      .rejects.toMatchObject({ statusCode: 503, message: NO_EXECUTION_SITE_MESSAGE })
    expect(site.rows.size).toBe(0)
  })

  it("answers an unreachable site with 503, and a site's refusal of the directory with its own status (502), not a 500", async () => {
    await ensureExecutionSite()
    const me = await createUser()
    site.down = true
    await expect(createWorkspaceAction({ name: 'files', ownerType: 'user', ownerId: me.id }, { user: me })).rejects.toMatchObject({ statusCode: 503 })
    site.down = false
    site.refuseDir = true
    await expect(createWorkspaceAction({ name: 'files', ownerType: 'user', ownerId: me.id }, { user: me })).rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('deleteWorkspaceAction @SC-320', () => {
  it('deletes the site-side row, then its placement', async () => {
    const { caller, workspaceId } = await projectWorkspace('MEMBER')

    await expect(deleteWorkspaceAction({ workspaceId }, caller)).resolves.toBeUndefined()

    expect(rowOf(workspaceId)).toBeUndefined()
    expect(await placementOf(workspaceId)).toBeNull()
  })

  // Deleting a workspace changes the project, which its Viewer may not (adr-0102).
  it("refuses the project's Viewer (403 saying so), deleting nothing", async () => {
    const { project, workspaceId } = await projectWorkspace()
    const viewer = await createUserWithRole('ADMIN')
    await joinProjectAs(project.id, viewer.id, 'VIEWER')
    await expect(deleteWorkspaceAction({ workspaceId }, { user: viewer }))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Viewer') })
    expect(rowOf(workspaceId)).toBeDefined()
  })

  it('refuses a workspace in a project the caller is not entitled to (403), and one that does not exist (404)', async () => {
    const { project, workspaceId } = await projectWorkspace()
    await prisma.project.update({ where: { id: project.id }, data: { accessLevel: 'PRIVATE' } })
    const operator = { user: await createUserWithRole('MEMBER') }

    await expect(deleteWorkspaceAction({ workspaceId }, operator)).rejects.toMatchObject({ statusCode: 403 })
    await expect(deleteWorkspaceAction({ workspaceId: 'nope' }, operator)).rejects.toMatchObject({ statusCode: 404 })
    expect(rowOf(workspaceId)).toBeDefined()
    expect(await placementOf(workspaceId)).not.toBeNull()
  })

  it('answers an unreachable owning site with 503, and keeps the placement for a retry', async () => {
    const { caller, workspaceId } = await projectWorkspace('MEMBER')
    site.down = true
    await expect(deleteWorkspaceAction({ workspaceId }, caller)).rejects.toMatchObject({ statusCode: 503 })
    expect(await placementOf(workspaceId)).not.toBeNull()
  })
})

describe('workspace allowed-tools cap @SC-311', () => {
  it('writes the parsed, deduped, trimmed list for a Member of the project, and null clears it', async () => {
    const { caller, workspaceId } = await projectWorkspace('MEMBER')

    await setWorkspaceAllowedToolsAction({ workspaceId, allowedTools: ['read_file', 'read_file', ' write_file '] }, caller)
    expect(rowOf(workspaceId)?.allowedTools).toEqual(['read_file', 'write_file'])

    await setWorkspaceAllowedToolsAction({ workspaceId, allowedTools: null }, caller)
    expect(rowOf(workspaceId)?.allowedTools).toBeNull()
  })

  it("refuses the project's Viewer and an outsider (403), a typo'd name and the legacy object shape (400), and an unknown workspace (404), writing nothing", async () => {
    const { caller, project, workspaceId } = await projectWorkspace('MEMBER')
    const viewer = { user: await createUserWithRole('MEMBER') }
    await joinProjectAs(project.id, viewer.user.id, 'VIEWER')
    await prisma.project.update({ where: { id: project.id }, data: { accessLevel: 'PRIVATE' } })
    const outsider = { user: await createUserWithRole('ADMIN') }
    await setWorkspaceAllowedToolsAction({ workspaceId, allowedTools: ['read_file'] }, caller)

    await expect(setWorkspaceAllowedToolsAction({ workspaceId, allowedTools: ['write_file'] }, viewer)).rejects.toMatchObject({ statusCode: 403 })
    await expect(setWorkspaceAllowedToolsAction({ workspaceId, allowedTools: ['write_file'] }, outsider)).rejects.toMatchObject({ statusCode: 403 })
    await expect(setWorkspaceAllowedToolsAction({ workspaceId, allowedTools: ['read_fil'] }, caller)).rejects.toMatchObject({ statusCode: 400 })
    await expect(setWorkspaceAllowedToolsAction({ workspaceId, allowedTools: [{ name: 'read_file', state: 'always' }] }, caller))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(setWorkspaceAllowedToolsAction({ workspaceId: 'missing', allowedTools: null }, caller)).rejects.toMatchObject({ statusCode: 404 })

    expect(rowOf(workspaceId)?.allowedTools).toEqual(['read_file'])
  })

  it('answers an unreachable owning site with 503 rather than silently passing', async () => {
    const { caller, workspaceId } = await projectWorkspace('MEMBER')
    site.down = true
    await expect(setWorkspaceAllowedToolsAction({ workspaceId, allowedTools: null }, caller)).rejects.toMatchObject({ statusCode: 503 })
  })

  // The value the action writes and the value the mint reads back must agree: a
  // mismatched representation would silently lock out every tool (ledger 15).
  describe('mint round-trip', () => {
    async function mintFor(allowedTools: unknown) {
      await ensureExecutionSite()
      const me = await createUserWithRole('MEMBER')
      const { workspaceId } = await createWorkspaceAction({ name: 'files', ownerType: 'user', ownerId: me.id }, { user: me })
      await setWorkspaceAllowedToolsAction({ workspaceId, allowedTools }, { user: me })
      const agent = { ...(await createAgent()), allowedTools: null, allowedBashPatterns: null, approval: 'deferred' }
      const session = { id: 's1', userId: me.id, primaryOwnerType: 'user' as const, primaryOwnerId: me.id, primaryWorkspaceId: workspaceId, taskId: null, sessionType: 'chat' }
      const capped = await resolveCapabilityClaims({ agent, session, primaryLoc: { ownerType: 'user', ownerId: me.id, workspaceId }, taskId: null, startedBy: 'person' })
      const uncapped = await resolveCapabilityClaims({
        agent, session: { ...session, primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null },
        primaryLoc: { ownerType: 'user', ownerId: me.id }, taskId: null, startedBy: 'person',
      })
      return { capped, uncapped }
    }

    it('a workspace whose cap was cleared contributes no cap — a tool stays always', async () => {
      const { capped, uncapped } = await mintFor(null)
      expect(capped.permissions).toEqual(uncapped.permissions)
      expect(capped.permissions.allowedTools.some((t) => t.name === 'read_file' && t.state === 'always')).toBe(true)
    })

    it("a workspace written with ['read_file'] caps every other tool to never", async () => {
      const { capped } = await mintFor(['read_file'])
      expect(capped.permissions.allowedTools.find((t) => t.name === 'read_file')).toEqual({ name: 'read_file', state: 'always' })
      const others = capped.permissions.allowedTools.filter((t) => t.name !== 'read_file')
      expect(others.length).toBeGreaterThan(0)
      expect(others.every((t) => t.state === 'never')).toBe(true)
    })
  })
})
