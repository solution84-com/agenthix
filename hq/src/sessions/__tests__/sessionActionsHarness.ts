import { prisma } from '../../test/db'
import { createUserWithRole, createAgent, createProject, createSession, createWorkerSession, createTestTask } from '../../test/factories'

// Shared by sessionCreate, sessionEdit and sessionRuns integration tests. The
// vi.mock blocks stay in each test file: vitest hoists them per file, and they
// close over per-file vi.hoisted values, so they cannot live here.

// Minimal Wasp operation context: authenticated user plus the entity delegates
// the operation touches, backed by the real test Prisma client.
export function ctx(user: { id: string } | undefined) {
  return {
    user,
    entities: {
      Agent: prisma.agent,
      AgentSession: prisma.agentSession,
      UserSettings: prisma.userSettings,
      ExecutionSite: prisma.executionSite,
      Project: prisma.project,
      Product: prisma.product,
      Program: prisma.program,
      Task: prisma.task,
      User: prisma.user,
    },
  } as any
}

// A task, in a project, for the task-scoped-session coverage: updateSession,
// archiveSession and triggerAgentRun must gate a task session by its project
// too, not just stopTaskSession/deleteTaskSession. Mirrors
// projects/__tests__/tasks.integration.test.ts's own makeTask.
let taskSeq = 0
export async function makeTaskInProject(projectId: string) {
  taskSeq++
  return createTestTask({
    data: { title: `Task ${taskSeq}`, projectId, number: taskSeq, onBehalfOfUserId: 'person-1' } as any,
  })
}

let fakeWorkspaceSeq = 0
// A minimal WorkspaceRow (@agenthix/core's siteData.ts) built in memory —
// nothing to persist against now that Workspace lives only in site's database.
export function fakeWorkspace(opts: { ownerType: string; ownerId: string }) {
  const now = new Date().toISOString()
  return {
    id: `workspace_${Date.now().toString(36)}_${fakeWorkspaceSeq++}`,
    name: 'Test Workspace',
    ownerType: opts.ownerType,
    ownerId: opts.ownerId,
    siteId: 'site-1',
    allowedTools: null,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * The cast the session entitlement tests need, in the real test DB: a private
 * project with one member, a task in it whose session names an arbitrary
 * routing administrator (TaskRunner's fallback identity, never an owner), the
 * member's own chat, a task session whose task was deleted, and one whose
 * task in the project was deleted (it still records the project).
 */
export async function seedSessionCast() {
  const member = await createUserWithRole('MEMBER')
  const outsiderAdmin = await createUserWithRole('ADMIN')
  const routingAdmin = await createUserWithRole('ADMIN')
  const agent = await createAgent()
  const project = await createProject({ accessLevel: 'PRIVATE' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })
  const task = await makeTaskInProject(project.id)
  const taskSession = await createSession({ userId: routingAdmin.id, agentId: agent.id, sessionType: 'task', taskId: task.id })
  // The member's own session with no task: a conversation's worker, since a chat from before no longer sends.
  const chat = await createWorkerSession({ userId: member.id, agentId: agent.id })
  const orphaned = await createSession({ userId: routingAdmin.id, agentId: agent.id, sessionType: 'task' })
  const orphanedInProject = await createSession({
    userId: routingAdmin.id, agentId: agent.id, sessionType: 'task', primaryOwnerType: 'project', primaryOwnerId: project.id,
  })
  return { member, outsiderAdmin, routingAdmin, agent, project, task, taskSession, chat, orphaned, orphanedInProject }
}

/** Sets a person's organisation role, or removes it (`null`). */
export async function setRole(userId: string, role: 'ADMIN' | 'MEMBER' | null) {
  await prisma.userSettings.deleteMany({ where: { userId } })
  if (role) await prisma.userSettings.create({ data: { userId, role } })
}

/** Makes a person the project's Viewer (adr-0102): they read it and change nothing. */
export async function makeProjectViewer(projectId: string, userId: string) {
  await prisma.projectMember.update({ where: { projectId_userId: { projectId, userId } }, data: { role: 'VIEWER' } })
}
