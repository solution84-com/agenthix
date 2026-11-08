/**
 * Who may send into a session (sessionSender.ts), by project role, over an in-memory stand-in for the four rows the
 * rule reads. The same rule against the real database, through the operations, is in sessionRunAccess and
 * sessionControl .integration.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Role = 'ADMIN' | 'MEMBER' | 'VIEWER'
type SessionRow = {
  id: string; userId: string; sessionType: string; taskId: string | null
  primaryOwnerType: string | null; primaryOwnerId: string | null; status: string; closedReason: string | null
}

const db = vi.hoisted(() => ({
  members: new Map<string, Role>(),
  tasks: new Map<string, string>(),
  projects: new Map<string, { personalOwnerId: string | null }>(),
  sessions: new Map<string, SessionRow>(),
}))

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return {
    ...actual,
    prisma: {
      project: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const p = db.projects.get(where.id)
          return p ? { ...p, personalOwner: p.personalOwnerId ? { deactivatedAt: null } : null } : null
        },
      },
      projectMember: {
        findUnique: async ({ where }: { where: { projectId_userId: { projectId: string; userId: string } } }) => {
          const role = db.members.get(`${where.projectId_userId.projectId}/${where.projectId_userId.userId}`)
          return role ? { role } : null
        },
      },
      task: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const projectId = db.tasks.get(where.id)
          return projectId ? { projectId } : null
        },
      },
      agentSession: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const s = db.sessions.get(where.id)
          return s ? { ...s, agent: { id: 'agent-1' } } : null
        },
      },
    },
  }
})

import { requireSessionSender } from '../sessionSender'
import { tasklessSessionPerson } from '../sessionEntitlement'

const PROJECT = 'project-1'
const TASK = 'task-1'

function session(over: Partial<SessionRow>): SessionRow {
  return {
    id: 's-task', userId: 'routing-admin', sessionType: 'task', taskId: TASK,
    primaryOwnerType: 'project', primaryOwnerId: PROJECT, status: 'ACTIVE', closedReason: null, ...over,
  }
}

beforeEach(() => {
  db.members.clear(); db.tasks.clear(); db.projects.clear(); db.sessions.clear()
  db.projects.set(PROJECT, { personalOwnerId: null })
  db.tasks.set(TASK, PROJECT)
  db.members.set(`${PROJECT}/admin`, 'ADMIN')
  db.members.set(`${PROJECT}/member`, 'MEMBER')
  db.members.set(`${PROJECT}/viewer`, 'VIEWER')
  db.members.set(`${PROJECT}/routing-admin`, 'MEMBER')
  db.sessions.set('s-task', session({}))
})

describe("sending into a task's session", () => {
  it("is open to the project's Members and Admins", async () => {
    await expect(requireSessionSender('s-task', 'member')).resolves.toMatchObject({ id: 's-task' })
    await expect(requireSessionSender('s-task', 'admin')).resolves.toMatchObject({ id: 's-task' })
  })

  it('refuses its Viewer, saying the role it needs, who to ask, and that nothing was changed', async () => {
    const refused = requireSessionSender('s-task', 'viewer')
    await expect(refused).rejects.toMatchObject({ statusCode: 403 })
    await expect(refused).rejects.toThrow(/needs the Member or Admin role in this project\. A Viewer .*ask one of its admins\. Nothing was changed\.$/)
  })

  it("refuses someone not on the project, an organisation admin included, saying who to ask", async () => {
    const refused = requireSessionSender('s-task', 'org-admin-outside')
    await expect(refused).rejects.toMatchObject({ statusCode: 403 })
    await expect(refused).rejects.toThrow(/requires membership of this project; ask one of its admins to add you\. Nothing was changed\.$/)
  })
})

describe('sending into a task session whose task was deleted', () => {
  it('is refused to the admin its row names, though they still work in the project', async () => {
    db.sessions.set('s-orphan', session({ id: 's-orphan', taskId: null }))
    await expect(requireSessionSender('s-orphan', 'routing-admin')).rejects.toMatchObject({ statusCode: 404 })
  })

  it("is still a personal project's person's own", async () => {
    db.sessions.set('s-mine', session({ id: 's-mine', taskId: null, userId: 'owner', primaryOwnerType: 'user', primaryOwnerId: 'owner' }))
    await expect(requireSessionSender('s-mine', 'owner')).resolves.toMatchObject({ id: 's-mine' })
    await expect(requireSessionSender('s-mine', 'member')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('sending into a chat', () => {
  it('is its person alone, and a person removed from its project since is told so', async () => {
    db.sessions.set('s-chat', session({ id: 's-chat', sessionType: 'chat', taskId: null, userId: 'member' }))
    await expect(requireSessionSender('s-chat', 'member')).resolves.toMatchObject({ id: 's-chat' })
    await expect(requireSessionSender('s-chat', 'admin')).rejects.toMatchObject({ statusCode: 404 })
    db.members.delete(`${PROJECT}/member`)
    await expect(requireSessionSender('s-chat', 'member')).rejects.toThrow(/^You no longer have access to this project; .* Nothing was changed\.$/)
  })
})

describe('tasklessSessionPerson', () => {
  it("is a chat's person, a personal task session's owner, and nobody for any other task session", () => {
    expect(tasklessSessionPerson({ userId: 'u1', sessionType: 'chat' })).toBe('u1')
    expect(tasklessSessionPerson({ userId: 'u1', sessionType: 'task', primaryOwnerType: 'user', primaryOwnerId: 'u1' })).toBe('u1')
    expect(tasklessSessionPerson({ userId: 'routing-admin', sessionType: 'task', primaryOwnerType: 'project', primaryOwnerId: 'p' })).toBeNull()
    expect(tasklessSessionPerson({ userId: 'routing-admin', sessionType: 'task' })).toBeNull()
  })
})
