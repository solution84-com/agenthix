/**
 * GitHub Operations — entitlement to the target owner (ADR-0060, spec §6.3),
 * against the real test database: projects, members and roles are real rows.
 *
 * Each of the four operations resolves a `RepoTarget` (an owner, optionally a
 * workspace) and either reads from GitHub or writes to it. Being signed in is
 * not being entitled to the owner named in the target, so every operation
 * must run `assertLocationAccess` before its GitHub call — not after, and
 * not merely before returning. The GitHub-function assertion is the point:
 * a check that ran but let the call through first would still leak the
 * answer, and for the write operation would already have changed
 * something on someone else's repository.
 *
 * GitHub itself and the site a named workspace is read from are the stand-ins;
 * whether GitHub was reached is the behaviour checked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createUser, createUserWithRole } from '../../test/factories'

const h = vi.hoisted(() => {
  class SiteUnreachableError extends Error {}
  return {
    getWorkspace: vi.fn(),
    listWorkflows: vi.fn(),
    listRuns: vi.fn(),
    listSecrets: vi.fn(),
    dispatchWorkflow: vi.fn(),
    SiteUnreachableError,
  }
})

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../storage/workspaceStore', () => ({
  getWorkspace: h.getWorkspace,
  SiteUnreachableError: h.SiteUnreachableError,
}))
vi.mock('../githubRuns', () => ({
  listWorkflows: h.listWorkflows,
  listRuns: h.listRuns,
  dispatchWorkflow: h.dispatchWorkflow,
}))
vi.mock('../githubSecrets', () => ({
  listGitHubSecrets: h.listSecrets,
}))

import { getWorkflows, getRuns, getRepoSecrets } from '../queries'
import { dispatchWorkflow } from '../actions'

type Target = { ownerType: 'project' | 'user'; ownerId: string; workspaceId?: string | null }
type Ctx = { user: { id: string } }

const CASES: Record<string, { run: (target: Target, ctx: Ctx) => Promise<unknown>; github: ReturnType<typeof vi.fn> }> = {
  getWorkflows: { run: (target, ctx) => getWorkflows({ target: target as any }, ctx as any), github: h.listWorkflows },
  getRuns: { run: (target, ctx) => getRuns({ target: target as any }, ctx as any), github: h.listRuns },
  getRepoSecrets: { run: (target, ctx) => getRepoSecrets({ target: target as any }, ctx as any), github: h.listSecrets },
  dispatchWorkflow: {
    run: (target, ctx) => dispatchWorkflow({ target: target as any, workflowFile: 'ci.yml' }, ctx as any),
    github: h.dispatchWorkflow,
  },
}

/** A private project, one person on it with the project role given (its Member by default), and one Member of the organisation outside it. */
async function privateProject(memberRole: 'ADMIN' | 'MEMBER' | 'VIEWER' = 'MEMBER') {
  const project = await createProject({ accessLevel: 'PRIVATE' })
  const member = await createUserWithRole('MEMBER')
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: memberRole } })
  const outsider = await createUserWithRole('MEMBER')
  const target = { ownerType: 'project' as const, ownerId: project.id, workspaceId: null }
  return { project, target, member: { user: member }, outsider: { user: outsider } }
}

beforeEach(() => {
  h.listWorkflows.mockReset().mockResolvedValue([])
  h.listRuns.mockReset().mockResolvedValue([])
  h.listSecrets.mockReset().mockResolvedValue([])
  h.dispatchWorkflow.mockReset().mockResolvedValue(undefined)
  h.getWorkspace.mockReset()
})

describe.each(Object.keys(CASES))('%s', (name) => {
  const { run, github } = CASES[name]

  it('refuses a person who is not entitled to the target owner, and never reaches GitHub', async () => {
    const { target, outsider } = await privateProject()
    await expect(run(target, outsider)).rejects.toMatchObject({ statusCode: 403 })
    expect(github).not.toHaveBeenCalled()
  })

  it("refuses another person's own files", async () => {
    const me = await createUserWithRole('MEMBER')
    const other = await createUser()
    await expect(run({ ownerType: 'user', ownerId: other.id }, { user: me })).rejects.toMatchObject({ statusCode: 403 })
    expect(github).not.toHaveBeenCalled()
  })

  it('serves a member of the owning project', async () => {
    const { target, member } = await privateProject()
    await run(target, member)
    expect(github).toHaveBeenCalled()
  })
})

// R-196 / SC-388: dispatching a workflow spends the organisation's GitHub
// runner time. The project's Viewer reads its repository and doesn't (adr-0102).
describe.each(['dispatchWorkflow'])('%s needs someone who works in the project', (name) => {
  const { run, github } = CASES[name]

  it("refuses the project's Viewer, saying so, and never reaches GitHub", async () => {
    const { target, member } = await privateProject('VIEWER')

    await expect(run(target, member)).rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('Viewer') })
    expect(github).not.toHaveBeenCalled()
  })

  it.each(['MEMBER', 'ADMIN'] as const)('lets its %s through', async (role) => {
    const { target, member } = await privateProject(role)
    await run(target, member)
    expect(github).toHaveBeenCalled()
  })
})

/**
 * The four operations pass the whole `RepoTarget` to `assertLocationAccess`,
 * not just its owner fields — a workspace-scoped target must be checked too,
 * or an entitled caller could name a workspace belonging to a different
 * owner and reach that owner's repo attachment instead. `getWorkflows` here
 * stands in for all four, which share the same two lines.
 */
describe('a workspace-scoped target is checked too, not only the owner', () => {
  it("refuses a workspace that does not belong to the target's owner (400)", async () => {
    const { project, member } = await privateProject()
    h.getWorkspace.mockResolvedValue({ id: 'ws-1', ownerType: 'project', ownerId: 'another-project' })

    await expect(getWorkflows({ target: { ownerType: 'project', ownerId: project.id, workspaceId: 'ws-1' } as any }, member as any))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(h.listWorkflows).not.toHaveBeenCalled()
  })

  it('surfaces a site-unreachable workspace lookup as 503, not a silent pass', async () => {
    const { project, member } = await privateProject()
    h.getWorkspace.mockRejectedValue(new h.SiteUnreachableError('site down'))

    await expect(getWorkflows({ target: { ownerType: 'project', ownerId: project.id, workspaceId: 'ws-1' } as any }, member as any))
      .rejects.toMatchObject({ statusCode: 503 })
    expect(h.listWorkflows).not.toHaveBeenCalled()
  })
})
