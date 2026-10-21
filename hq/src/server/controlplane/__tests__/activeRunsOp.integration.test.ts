/**
 * `list_active_runs` (person-scoped execution spec §3, ADR-0077, task
 * 2.20/2.21) — the MCP tool op. Covers: scope is derived from the
 * capability's own boundary (never an argument), a person's connection sees
 * its person's own runs unless it is limited to chosen projects, and the site-unreachable error surfaces as the explicit
 * `unavailable` code rather than an empty list.
 *
 * Against the real test database, which says whether a project is a personal
 * one. What is running lives on the site, so that read is replaced; the
 * boundary it is asked for is what these tests check.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { createUser, createProject, createTestTask } from '../../../test/factories'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
const mockResolveActiveRuns = vi.hoisted(() => vi.fn())
vi.mock('../../../sessions/activeRuns', () => ({ resolveActiveRuns: mockResolveActiveRuns }))

import { listActiveRunsOp } from '../activeRunsOp'
import { ControlPlaneError } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { SiteUnreachableError } from '../../../storage/workspaceStore'

let alice: string
const claims = (over: Partial<CapabilityClaims> = {}): CapabilityClaims =>
  ({
    tokenType: 'capability', userId: alice, agentId: 'agent-scout', sessionId: 's1',
    projectId: null, workspaceId: null, taskId: null, role: 'MEMBER', siteId: 'site-1',
    permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
    ...over,
  }) as CapabilityClaims

let projectId: string
beforeEach(async () => {
  vi.clearAllMocks()
  projectId = (await createProject()).id
  // Every run is checked against its person (adr-0101): alice, whose chat s1 is, a member of the project.
  alice = (await createUser()).id
  await prisma.agent.create({ data: { id: 'agent-scout', name: 'Scout', handle: 'scout' } })
  await prisma.agentSession.create({ data: { id: 's1', userId: alice, agentId: 'agent-scout', sessionType: 'chat' } })
  await prisma.projectMember.create({ data: { projectId, userId: alice } })
})

describe('scope follows the run\'s own capability, never an argument', () => {
  it('a project-run capability sees the project\'s runs', async () => {
    mockResolveActiveRuns.mockResolvedValue([{ runId: 'run-1' }])

    const result = await listActiveRunsOp({ kind: 'run', claims: claims({ projectId }) }, { ownerType: 'project', ownerId: 'someone-elses-project' })

    expect(mockResolveActiveRuns).toHaveBeenCalledWith('project', projectId)
    expect(result).toEqual({ runs: [{ runId: 'run-1' }] })
  })

  it("a project-run capability whose person is no longer a member of the project sees nothing", async () => {
    await prisma.projectMember.deleteMany({ where: { projectId, userId: alice } })
    const err = await listActiveRunsOp({ kind: 'run', claims: claims({ projectId }) }, {}).catch(e => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err.code).toBe('forbidden')
    expect(mockResolveActiveRuns).not.toHaveBeenCalled()
  })

  it('a personal capability (projectId null) sees only its own person\'s boundary', async () => {
    mockResolveActiveRuns.mockResolvedValue([])

    await listActiveRunsOp({ kind: 'run', claims: claims({ projectId: null }) }, {})

    expect(mockResolveActiveRuns).toHaveBeenCalledWith('user', alice)
  })
})

describe("a personal project's task run (agents own schedule spec §4)", () => {
  it("sees its person's own boundary, where it works — never a project's", async () => {
    const mine = await createProject({ accessLevel: 'PRIVATE', personalOwnerId: alice })
    await createTestTask({ data: { id: 't1', title: 't', projectId: mine.id, number: 1, onBehalfOfUserId: alice } })
    mockResolveActiveRuns.mockResolvedValue([])

    await listActiveRunsOp({ kind: 'run', claims: claims({ role: null, projectId: mine.id, taskId: 't1' }) }, {})

    expect(mockResolveActiveRuns).toHaveBeenCalledWith('user', alice)
    expect(mockResolveActiveRuns).not.toHaveBeenCalledWith('project', expect.anything())
  })
})

describe("a person's connection (adr-0090)", () => {
  it("sees its person's own runs, as their chat run would", async () => {
    mockResolveActiveRuns.mockResolvedValue([])
    await listActiveRunsOp(connectionCaller({ userId: 'user-bob' }), {})
    expect(mockResolveActiveRuns).toHaveBeenCalledWith('user', 'user-bob')
  })

  it('is refused when limited to chosen projects — its person\'s own storage is none of them', async () => {
    const err = await listActiveRunsOp(connectionCaller({ projectIds: ['p1'] }), {}).catch(e => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err.code).toBe('forbidden')
    expect(mockResolveActiveRuns).not.toHaveBeenCalled()
  })
})

describe('an unreachable site', () => {
  it('surfaces as the explicit unavailable error, not an empty list', async () => {
    mockResolveActiveRuns.mockRejectedValue(new SiteUnreachableError('Box', 'site-1'))

    const err = await listActiveRunsOp({ kind: 'run', claims: claims({ projectId }) }, {}).catch(e => e)

    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err.code).toBe('unavailable')
    expect(err.message).toMatch(/unreachable/i)
  })
})
