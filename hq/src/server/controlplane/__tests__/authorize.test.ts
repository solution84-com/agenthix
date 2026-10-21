/**
 * Control-plane authorization rules (spec §7.2, adr-0101): the boundary
 * confines a run, and its person bounds it. Who the person is, their
 * organisation role and their role in the project (adr-0102) are read from the
 * database; here they are given, so these
 * tests pin the rule itself. The reads are tested against the real database in
 * runAuthority.integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CapabilityClaims } from '@agenthix/core'
import { ORG_ESCAPING_TOOLS, minRoleForOrgEscapingTool, type OrgRole } from '../../identity/rolePolicy'
import { ControlPlaneError, type CallerContext } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'

const person = vi.hoisted(() => ({ value: { userId: 'u1', role: 'MEMBER' as OrgRole | null } as { userId: string; role: OrgRole | null } | null }))
// `project:user` → their standing there: a Member or Admin works, a Viewer reads; absent is no member.
const members = vi.hoisted(() => ({ of: new Map<string, 'works' | 'reads'>() }))

vi.mock('../runPerson', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../runPerson')>()
  const { ControlPlaneError } = await import('../types')
  return {
    ...actual,
    actingPerson: vi.fn(async (ctx: CallerContext, what: string) => {
      if (ctx.kind === 'connection') return { userId: ctx.connection.userId, role: ctx.connection.role }
      if (!person.value) throw new ControlPlaneError('forbidden', `${what} needs a person's authority, and this run is on behalf of no one`)
      return person.value
    }),
  }
})
vi.mock('../../../projects/membership', () => ({
  projectStanding: vi.fn(async (projectId: string, userId: string) => members.of.get(`${projectId}:${userId}`) ?? 'none'),
}))

import { requireRoleFloor, requireProjectScope, requireProjectEntitlement, actingAgentId } from '../authorize'

function makeClaims(overrides: Partial<CapabilityClaims> = {}): CapabilityClaims {
  return {
    tokenType: 'capability',
    userId: 'u1',
    runner: { kind: 'person', userId: 'u1' }, startedBy: 'person' as const,
    agentId: 'agent-1',
    sessionId: 's1',
    projectId: null,
    workspaceId: null,
    taskId: null,
    role: null,
    siteId: 'site-local',
    permissions: { bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] },
    ...overrides,
  }
}

const run = (overrides: Partial<CapabilityClaims> = {}): CallerContext => ({ kind: 'run', claims: makeClaims(overrides) })
const ownChat = () => run()
const projectRun = (projectId = 'p1', over: Partial<CapabilityClaims> = {}) => run({ projectId, ...over })

const ADMIN_CONNECTION = connectionCaller({ role: 'ADMIN' })

async function refusal(promise: Promise<unknown>): Promise<ControlPlaneError> {
  const err = await promise.then(() => null, (e: unknown) => e)
  expect(err).toBeInstanceOf(ControlPlaneError)
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

beforeEach(() => {
  person.value = { userId: 'u1', role: 'MEMBER' }
  members.of = new Map([['p1:u1', 'works']])
})

describe('control-plane authorization @SC-306 @SC-308 @SC-309', () => {
  describe("a person's connection (adr-0090) — its person's role, its own project list", () => {
    it.each(ORG_ESCAPING_TOOLS)("an admin's connection passes the %s role floor", async (tool) => {
      await expect(requireRoleFloor(ADMIN_CONNECTION, tool)).resolves.toBeUndefined()
    })

    it.each(ORG_ESCAPING_TOOLS)("a member's connection is refused %s, naming the role", async (tool) => {
      const err = await refusal(requireRoleFloor(connectionCaller({ role: 'MEMBER' }), tool))
      expect(err.message).toContain(minRoleForOrgEscapingTool(tool))
    })

    it.each(ORG_ESCAPING_TOOLS)("an admin's connection limited to chosen projects is refused %s, which reaches beyond them", async (tool) => {
      const err = await refusal(requireRoleFloor(connectionCaller({ role: 'ADMIN', projectIds: ['p1'] }), tool))
      expect(err.message).toMatch(/limited to/)
    })

    it('with no project list it is not confined to any one project', () => {
      expect(() => requireProjectScope(ADMIN_CONNECTION, 'p1', 'thing')).not.toThrow()
    })

    it('with a project list it reaches those projects and refuses every other, and an entity with no project', () => {
      const limited = connectionCaller({ projectIds: ['p1'] })
      expect(() => requireProjectScope(limited, 'p1', 'thing')).not.toThrow()
      expect(syncRefusal(() => requireProjectScope(limited, 'p2', 'thing')).message).toMatch(/not limited to/)
      syncRefusal(() => requireProjectScope(limited, null, 'thing'))
    })

    it("is held to its person's role in the project: a Viewer's connection reads and changes nothing", async () => {
      members.of.set('p1:user-conn', 'reads')
      await expect(requireProjectEntitlement(connectionCaller({ role: 'ADMIN' }), 'p1', 'get_task_details', 'read')).resolves.toBeUndefined()
      await refusal(requireProjectEntitlement(connectionCaller({ role: 'ADMIN' }), 'p1', 'delete_task', 'work'))
      members.of.set('p1:user-conn', 'works')
      await expect(requireProjectEntitlement(connectionCaller({ role: 'MEMBER' }), 'p1', 'delete_task', 'work')).resolves.toBeUndefined()
    })

    it('is no agent: actingAgentId takes the agent it names, and refuses when it names none', () => {
      expect(actingAgentId(ADMIN_CONNECTION, 'agent-argued')).toBe('agent-argued')
      expect(syncRefusal(() => actingAgentId(ADMIN_CONNECTION)).code).toBe('invalid')
      expect(syncRefusal(() => actingAgentId(ADMIN_CONNECTION, null)).code).toBe('invalid')
    })
  })

  describe('org-escaping tools: only a chat in its own storage, with its person role @SC-624', () => {
    it.each(ORG_ESCAPING_TOOLS)('an ADMIN person passes %s', async (tool) => {
      person.value = { userId: 'u1', role: 'ADMIN' }
      await expect(requireRoleFloor(ownChat(), tool)).resolves.toBeUndefined()
    })

    it.each(ORG_ESCAPING_TOOLS)('a MEMBER person is refused %s', async (tool) => {
      expect(minRoleForOrgEscapingTool(tool)).toBe('ADMIN')
      await refusal(requireRoleFloor(ownChat(), tool))
    })

    it.each(ORG_ESCAPING_TOOLS)("the person's role is what counts, never the role the capability carries (%s)", async (tool) => {
      person.value = { userId: 'u1', role: 'MEMBER' }
      await refusal(requireRoleFloor(run({ role: 'ADMIN' }), tool))
    })

    it.each(ORG_ESCAPING_TOOLS)("a run in a project is refused %s, whatever its person's role", async (tool) => {
      person.value = { userId: 'u1', role: 'ADMIN' }
      const err = await refusal(requireRoleFloor(projectRun(), tool))
      expect(err.message).toMatch(/beyond the project this run is confined to/)
    })

    it.each(ORG_ESCAPING_TOOLS)('a task run with no project is refused %s too — only a chat reaches its own storage', async (tool) => {
      person.value = { userId: 'u1', role: 'ADMIN' }
      await refusal(requireRoleFloor(run({ taskId: 't1' }), tool))
    })

    it.each(ORG_ESCAPING_TOOLS)('a run on behalf of no one is refused %s', async (tool) => {
      person.value = null
      const err = await refusal(requireRoleFloor(ownChat(), tool))
      expect(err.message).toMatch(/on behalf of no one/)
    })
  })

  describe("the boundary's confinement @SC-624", () => {
    it('a run in a project reaches its own project, and refuses another and an entity with no project', () => {
      expect(() => requireProjectScope(projectRun('p1'), 'p1', 'task')).not.toThrow()
      syncRefusal(() => requireProjectScope(projectRun('p1'), 'p2', 'task'))
      syncRefusal(() => requireProjectScope(projectRun('p1'), null, 'task'))
    })

    it('a chat in its own storage is not confined to one project', () => {
      expect(() => requireProjectScope(ownChat(), 'p2', 'task')).not.toThrow()
    })

    it('a task run naming no project reaches nothing', () => {
      syncRefusal(() => requireProjectScope(run({ taskId: 't1' }), 'p1', 'task'))
    })

    it('a token missing projectId (an unvalidated payload) reaches nothing', () => {
      const claims: Record<string, unknown> = { ...makeClaims() }
      delete claims.projectId
      const ctx: CallerContext = { kind: 'run', claims: claims as unknown as CapabilityClaims }
      syncRefusal(() => requireProjectScope(ctx, 'p1', 'task'))
    })
  })

  describe('the person bounds every project operation (adr-0101) @SC-621', () => {
    it("a run in its own project is refused when its person is not a member", async () => {
      members.of.clear()
      const err = await refusal(requireProjectEntitlement(projectRun('p1'), 'p1', 'get_task_details', 'read'))
      expect(err.message).toMatch(/membership/)
    })

    it("a run in a project is held to its person's role there: on a Viewer's behalf it reads and changes nothing (adr-0102)", async () => {
      members.of.set('p1:u1', 'reads')
      await expect(requireProjectEntitlement(projectRun('p1'), 'p1', 'get_task_details', 'read')).resolves.toBeUndefined()
      const err = await refusal(requireProjectEntitlement(projectRun('p1'), 'p1', 'archive_task', 'work'))
      expect(err.message).toContain('Viewer')
      members.of.set('p1:u1', 'works')
      await expect(requireProjectEntitlement(projectRun('p1'), 'p1', 'archive_task', 'work')).resolves.toBeUndefined()
    })

    it("no organisation role grants work in a project: an org admin who is its Viewer is refused", async () => {
      person.value = { userId: 'u1', role: 'ADMIN' }
      members.of.set('p1:u1', 'reads')
      await refusal(requireProjectEntitlement(projectRun('p1'), 'p1', 'archive_task', 'work'))
    })

    it('a person who is a member of another project cannot reach it from a run confined elsewhere', async () => {
      members.of.set('p2:u1', 'works')
      await refusal(requireProjectEntitlement(projectRun('p1'), 'p2', 'get_task_details', 'read'))
    })

    it('a chat in its own storage reaches what its person is a member of', async () => {
      members.of.set('p2:u1', 'works')
      await expect(requireProjectEntitlement(ownChat(), 'p2', 'get_task_details', 'read')).resolves.toBeUndefined()
      await refusal(requireProjectEntitlement(ownChat(), 'p3', 'get_task_details', 'read'))
    })

    it('a bypassed agent changes none of it', async () => {
      members.of.set('p1:u1', 'reads')
      const bypassed = projectRun('p1', { permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] } })
      await refusal(requireProjectEntitlement(bypassed, 'p1', 'delete_task', 'work'))
    })

    it('a run on behalf of no one is refused @SC-623', async () => {
      person.value = null
      await refusal(requireProjectEntitlement(projectRun('p1'), 'p1', 'get_task_details', 'read'))
    })
  })

  it('actingAgentId returns claims.agentId even when the argument names another agent', () => {
    expect(actingAgentId(run({ agentId: 'agent-real' }), 'agent-argued')).toBe('agent-real')
  })
})
