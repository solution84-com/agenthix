/**
 * A conversation's turn is the person whose message it answers, confined to the conversation's place
 * (adr-0082, adr-0101): nothing it does exceeds what that person may do there, and nothing reaches another
 * project. The person's organisation standing and project role are given here, so these tests pin the rules;
 * the reads themselves are the ones runs use, tested against the real database in runAuthority.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ORG_ESCAPING_TOOLS, minRoleForOrgEscapingTool, type OrgRole } from '../../identity/rolePolicy'
import { ControlPlaneError, callerUserId, type CallerContext } from '../types'
import { projectTurn, turnCaller } from './turnFixtures'

// Who is in the organisation, with which role; absent is someone who has left.
const people = vi.hoisted(() => ({ of: new Map<string, OrgRole | null>() }))
// `project:user` → their standing there.
const members = vi.hoisted(() => ({ of: new Map<string, 'works' | 'reads'>() }))

vi.mock('wasp/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wasp/server')>()),
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        people.of.has(where.id) ? { deactivatedAt: null, settings: { role: people.of.get(where.id) } } : null),
    },
  },
}))
vi.mock('../../../projects/membership', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../projects/membership')>()),
  projectStanding: vi.fn(async (projectId: string, userId: string) => members.of.get(`${projectId}:${userId}`) ?? 'none'),
}))
vi.mock('../../../projects/taskOnBehalfOf', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../projects/taskOnBehalfOf')>()),
  personMayWorkInProject: vi.fn(async (projectId: string, userId: string) => members.of.get(`${projectId}:${userId}`) === 'works'),
}))

import { actingPerson } from '../runPerson'
import { requireRoleFloor, requireProjectScope, requireProjectEntitlement, actingAgentId } from '../authorize'
import { listTasksOp, runTaskOp } from '../taskOps'
import { listBoardsOp } from '../boardOps'
import { startGate, TURN_START_NOTE } from '../startGate'
import { originOfRun } from '../runOnBehalfOf'
import { requireMaySchedule } from '../scheduleOps'

async function refusal(promise: Promise<unknown>): Promise<ControlPlaneError> {
  const err = await promise.then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(ControlPlaneError)
  expect((err as ControlPlaneError).code).toBe('forbidden')
  return err as ControlPlaneError
}

function syncRefusal(fn: () => void): ControlPlaneError {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(ControlPlaneError)
    return err as ControlPlaneError
  }
  expect.unreachable('expected fn to throw')
}

const noOne = (over = {}): CallerContext => projectTurn({ actingUserId: null, readerUserId: 'u1', ...over })

beforeEach(() => {
  people.of = new Map([['u1', 'MEMBER']])
  members.of = new Map([['p1:u1', 'works'], ['p2:u1', 'works']])
})

describe('the person a turn acts for, as they are now @SC-950', () => {
  it('is the author of the message it answers, with their role read now, never the role it was minted with', async () => {
    people.of.set('u1', 'MEMBER')
    await expect(actingPerson(turnCaller({ role: 'ADMIN' }), 'thing')).resolves.toEqual({ userId: 'u1', role: 'MEMBER' })
  })

  it('is refused once that person has left the organisation', async () => {
    people.of.clear()
    expect((await refusal(actingPerson(turnCaller(), 'list_tasks'))).message).toMatch(/no longer in the organisation/)
  })

  it('for a turn that answers no one is the conversation\'s reader, and with no reader it is no one', async () => {
    await expect(actingPerson(noOne(), 'list_tasks')).resolves.toEqual({ userId: 'u1', role: 'MEMBER' })
    expect((await refusal(actingPerson(noOne({ readerUserId: null }), 'list_tasks'))).message).toMatch(/on behalf of no one/)
  })
})

describe("the conversation's place confines the turn @SC-950", () => {
  it('a turn in a project reaches that project, and refuses another and an entity with no project', () => {
    expect(() => requireProjectScope(projectTurn(), 'p1', 'task')).not.toThrow()
    expect(syncRefusal(() => requireProjectScope(projectTurn(), 'p2', 'task')).message).toMatch(/outside this turn's project scope/)
    syncRefusal(() => requireProjectScope(projectTurn(), null, 'task'))
  })

  it("a task's thread is confined to the task's project", () => {
    const thread = turnCaller({ home: 'TASK', projectId: 'p1', taskId: 't1' })
    expect(() => requireProjectScope(thread, 'p1', 'task')).not.toThrow()
    syncRefusal(() => requireProjectScope(thread, 'p2', 'task'))
  })

  it('a turn whose place names no project reaches nothing', () => {
    syncRefusal(() => requireProjectScope(projectTurn({ projectId: null }), 'p1', 'task'))
    syncRefusal(() => requireProjectScope(turnCaller({ home: 'TASK', projectId: null, taskId: 't1' }), 'p1', 'task'))
  })

  it("a personal conversation that names a project reads as confined, never as the person's whole reach", () => {
    syncRefusal(() => requireProjectScope(turnCaller({ home: 'PERSON', projectId: 'p1' }), 'p2', 'task'))
  })

  it("a conversation in the person's own space reaches what its person may, project by project", async () => {
    expect(() => requireProjectScope(turnCaller(), 'p2', 'task')).not.toThrow()
    members.of.delete('p2:u1')
    expect((await refusal(requireProjectEntitlement(turnCaller(), 'p2', 'get_task_details', 'read'))).message).toMatch(/membership/)
  })

  it('a turn in a project listing tasks or boards of another project is refused before anything is read', async () => {
    await refusal(listTasksOp(projectTurn(), { projectId: 'p2' }))
    await refusal(listBoardsOp(projectTurn(), { projectId: 'p2' }))
    // Naming no project is no listing across them: refused before anything is read.
    await expect(listTasksOp(projectTurn({ projectId: null }), {} as never)).rejects.toBeInstanceOf(ControlPlaneError)
    await expect(listBoardsOp(projectTurn({ projectId: null }), {} as never)).rejects.toBeInstanceOf(ControlPlaneError)
  })
})

describe("the person bounds what the turn does in its place @SC-950", () => {
  it("is refused in its own project when its person is not a member", async () => {
    members.of.clear()
    await refusal(requireProjectEntitlement(projectTurn(), 'p1', 'get_task_details', 'read'))
  })

  it("on a Viewer's behalf it reads and changes nothing", async () => {
    members.of.set('p1:u1', 'reads')
    await expect(requireProjectEntitlement(projectTurn(), 'p1', 'get_task_details', 'read')).resolves.toBeUndefined()
    expect((await refusal(requireProjectEntitlement(projectTurn(), 'p1', 'archive_task', 'work'))).message).toContain('Viewer')
  })

  it('a turn that answers no one reads, and is refused any change though its reader works in the project', async () => {
    await expect(requireProjectEntitlement(noOne(), 'p1', 'get_task_details', 'read')).resolves.toBeUndefined()
    expect((await refusal(requireProjectEntitlement(noOne(), 'p1', 'archive_task', 'work'))).message).toMatch(/may only read/)
  })

  it.each(ORG_ESCAPING_TOOLS)("a turn in a project is refused %s, whatever its person's role", async (tool) => {
    people.of.set('u1', 'ADMIN')
    expect((await refusal(requireRoleFloor(projectTurn(), tool))).message).toMatch(/beyond the project this turn is confined to/)
  })

  it.each(ORG_ESCAPING_TOOLS.filter(t => minRoleForOrgEscapingTool(t) === 'ADMIN'))("in the person's own space %s takes the person's role now", async (tool) => {
    people.of.set('u1', 'MEMBER')
    await refusal(requireRoleFloor(turnCaller({ role: 'ADMIN' }), tool))
    people.of.set('u1', 'ADMIN')
    await expect(requireRoleFloor(turnCaller(), tool)).resolves.toBeUndefined()
  })

  it("in the person's own space create_project is every member's", async () => {
    people.of.set('u1', 'MEMBER')
    await expect(requireRoleFloor(turnCaller(), 'create_project')).resolves.toBeUndefined()
  })

  it('acts as its own agent, whatever agent a call names', () => {
    expect(actingAgentId(turnCaller({ agentId: 'agent-1' }), 'agent-other')).toBe('agent-1')
  })
})

describe('a turn starts no work @SC-950', () => {
  it('a task it creates is never started through the tools: its start is an operation of its own', async () => {
    await expect(startGate(projectTurn())).resolves.toEqual({ refusal: TURN_START_NOTE })
  })

  it('run_task and the scheduling tools refuse it outright', async () => {
    await refusal(runTaskOp(projectTurn(), { taskId: 't1' }))
    await refusal(requireMaySchedule(projectTurn(), 'p1', 'set_task_schedule'))
  })

  it('a task it creates is on behalf of its person, who must work in the project', async () => {
    await expect(originOfRun(projectTurn(), 'p1', 'create_task')).resolves.toMatchObject({ onBehalfOfUserId: 'u1' })
    members.of.set('p1:u1', 'reads')
    await refusal(originOfRun(projectTurn(), 'p1', 'create_task'))
    await refusal(originOfRun(noOne(), 'p1', 'create_task'))
  })

  it('a turn that answers no one is behind no act on the record', () => {
    syncRefusal(() => callerUserId(noOne()))
    expect(callerUserId(turnCaller())).toBe('u1')
  })
})
