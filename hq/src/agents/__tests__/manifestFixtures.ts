// Rows the manifest integration tests share: people with roles, projects on a site, and pending-approval runs
// held on that site by the siteRuntimeStore fake. Each test file mocks `wasp/server` and the fake itself.
import { PLATFORM_PACKAGE_KEY, type RunRow } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createAgent, createProject, createSession, createWorkerSession, createUser, ensureExecutionSite, createTestTask } from '../../test/factories'
import * as siteStore from '../../test/fakes/siteRuntimeStore'
import { writePackage } from '../../packages/packageStore'
import { writeAgentContent } from '../../packages/agentPackageService'

/** The platform package every run resolves; a resumed chat run builds its context from it. */
export function platformPackage() {
  return writePackage({ kind: 'platform', key: PLATFORM_PACKAGE_KEY, files: [{ path: 'PLATFORM.md', content: Buffer.from('platform') }], updatedById: null })
}

async function agentWithContent() {
  const agent = await createAgent()
  await writeAgentContent(agent.id, { instructions: 'I', skillFiles: [] }, null)
  return agent
}

export async function makeUser(role: 'ADMIN' | 'MEMBER' = 'MEMBER') {
  const user = await createUser()
  await prisma.userSettings.create({ data: { userId: user.id, role, config: {} } })
  return user
}

/** A person on `project` with `role` there — acting on its work needs a Member or Admin, open project or not (adr-0099, adr-0102). */
export async function makeMember(project: { id: string }, role: 'ADMIN' | 'MEMBER' | 'VIEWER' = 'MEMBER') {
  const user = await makeUser('MEMBER')
  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role } })
  return user
}

export const ctxFor = (userId: string) => ({ user: { id: userId } }) as any

/** A second registered site, besides the install's own. */
export async function secondSite() {
  return prisma.executionSite.create({
    data: {
      siteId: `site-b-${Date.now().toString(36)}`, label: 'Second site', status: 'ONLINE',
      credentialHash: 'e'.repeat(64), credentialPrefix: 'smc_test_second',
    },
  })
}

/** The logical site id a project's storage sits on. */
export async function siteIdOf(project: { executionSiteId: string | null }): Promise<string> {
  const site = await prisma.executionSite.findUniqueOrThrow({ where: { id: project.executionSiteId! } })
  return site.siteId
}

let seq = 0
// As the site writes a request: each tool by name and each command by its pattern.
const pending = { summary: 'do a thing', tools: [{ name: 'Bash' }], bashPatterns: [{ pattern: 'git ', reason: 'git status' }] }

function addPendingRun(siteId: string, row: Partial<RunRow> & { sessionId: string; agentId: string }) {
  return siteStore.addRun(siteId, {
    id: `run-${++seq}`, status: 'RUNNING', manifestStatus: 'PENDING_APPROVAL', pendingManifest: pending, ...row,
  })
}

/**
 * A task run waiting on a manifest, in `project` (an open project on the install's site unless given), with the
 * comment the task machine writes when a run goes blocked — which is how approve and reject find the task.
 */
export async function makeTaskRun(opts: {
  project?: Awaited<ReturnType<typeof createProject>>
  manifestStatus?: RunRow['manifestStatus']
  runStartedBy?: string | null
  withBoard?: boolean
} = {}) {
  const project = opts.project ?? (await createProject({ name: 'P' }))
  const agent = await agentWithContent()
  const routingUser = await makeUser()
  const board = opts.withBoard ? await prisma.board.create({ data: { name: 'B', projectId: project.id } }) : null
  const task = await createTestTask({
    data: {
      title: 'Task', projectId: project.id, number: ++seq, onBehalfOfUserId: routingUser.id, assignedAgentId: agent.id,
      runState: 'RUN_BLOCKED', runStartedBy: opts.runStartedBy ?? null, boardId: board?.id ?? null,
    },
  })
  const session = await createSession({
    agentId: agent.id, userId: routingUser.id, sessionType: 'task', taskId: task.id,
    primaryOwnerType: 'project', primaryOwnerId: project.id,
  })
  const siteId = await siteIdOf(project)
  const run = addPendingRun(siteId, {
    sessionId: session.id, agentId: agent.id, taskId: task.id, manifestStatus: opts.manifestStatus ?? 'PENDING_APPROVAL',
  })
  await prisma.taskComment.create({
    data: { taskId: task.id, authorType: 'AGENT', agentId: agent.id, runId: run.id, content: `__MANIFEST_APPROVAL__:${run.id}` },
  })
  return { project, agent, task, session, run, siteId, board }
}

/** A run with no task — a conversation's worker's — waiting on a manifest: in its person's own storage, or bound to `project` when one is given. */
export async function makeChatRun(
  owner: { id: string },
  project?: Awaited<ReturnType<typeof createProject>>,
  opts: { fromBefore?: boolean } = {},
) {
  const agent = await agentWithContent()
  // A chat from before the new conversations has no conversation; a worker's session has one.
  const session = await (opts.fromBefore ? createSession : createWorkerSession)({
    agentId: agent.id, userId: owner.id, sessionType: 'chat',
    ...(project ? { primaryOwnerType: 'project', primaryOwnerId: project.id } : {}),
  })
  const siteId = project ? await siteIdOf(project) : (await ensureExecutionSite()).siteId
  const run = addPendingRun(siteId, { sessionId: session.id, agentId: agent.id, taskId: null })
  return { agent, session, run, siteId }
}

/** A private project with `members` listed on it, each with `role` there. */
export async function privateProject(members: Array<{ id: string }>, data: Record<string, unknown> = {}, role: 'ADMIN' | 'MEMBER' | 'VIEWER' = 'MEMBER') {
  const project = await createProject({ name: 'Private', accessLevel: 'PRIVATE', ...data })
  for (const m of members) await prisma.projectMember.create({ data: { projectId: project.id, userId: m.id, role } })
  return project
}
