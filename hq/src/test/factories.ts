import { prisma } from './db'
import { projectTasksBoardCreate } from '../projects/boardColumns'

// Entity factories for integration tests (ADR-0035). Each returns the created
// row; dependencies (user, agent) are auto-created when not supplied. `data` is
// an untyped passthrough by design — these are test helpers and the values are
// validated by Prisma at insert time, not worth mirroring the generated input
// types here.

let n = 0
const uniq = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${n++}`

/**
 * The install's own Execution Site, find-or-create. A real install registers a
 * site before it can do anything (see the repo's setup notes), and since this
 * phase a location with no site is a refusal rather than a fallback — so the
 * fixtures have to stand one up the same way, or every placement resolves to
 * an error before the behaviour under test is reached.
 *
 * Find-or-create against the same predicate `resolveDefaultSiteRef` uses
 * (the `isDefault` row, credentialed, not revoked), so however many factories
 * ask for it, one test sees exactly one default site — hq's own, the one a
 * run with no storage goes to.
 *
 * `createUser` and `createAgent` deliberately do NOT call it. Neither a person
 * nor an agent has a home site — a person's storage is placed the first time
 * work runs in it, and an agent is placed by whatever storage its session
 * works in. Seeding a site under them would also quietly rewrite what the
 * tests that exercise the site registry itself, and the ones that prove a
 * chat session needs no registered site, are testing. Those cases ask for a
 * site by name.
 */
/**
 * `data` applies only when this creates the row. If the default site already
 * exists — any earlier factory call in the same test may have made one — that
 * site is returned and `data` is silently discarded, so a test that needs a
 * specific `siteId` must ask for it before anything else stands a site up.
 */
export async function ensureExecutionSite(data: Record<string, unknown> = {}) {
  const existing = await prisma.executionSite.findFirst({
    where: { isDefault: true, credentialHash: { not: null }, status: { not: 'REVOKED' } },
  })
  if (existing) return existing
  return prisma.executionSite.create({
    data: {
      siteId: uniq('site'),
      label: 'Test Execution Site',
      status: 'ONLINE',
      credentialHash: 'f'.repeat(64),
      credentialPrefix: 'smc_test_fixture',
      isDefault: true,
      ...data,
    } as any,
  })
}

export function createUser(data: Record<string, unknown> = {}) {
  return prisma.user.create({ data: data as any })
}

/**
 * A person with an organisation role. The organisation-wide floors read the
 * caller's own settings row and treat a missing row as no role at all, so a
 * test that calls an action behind one needs its caller made this way. Work
 * in a project reads their role there instead (`joinProjectAs`).
 */
export async function createUserWithRole(role: 'ADMIN' | 'MEMBER', data: Record<string, unknown> = {}) {
  const user = await createUser(data)
  await prisma.userSettings.create({ data: { userId: user.id, role } })
  return user
}

/** Puts a person on a project's member list with a role there (adr-0102): a Viewer reads it and changes nothing. */
export function joinProjectAs(projectId: string, userId: string, role: 'ADMIN' | 'MEMBER' | 'VIEWER' = 'MEMBER') {
  return prisma.projectMember.create({ data: { projectId, userId, role } })
}

export function createAgent(data: Record<string, unknown> = {}) {
  return prisma.agent.create({
    data: { name: 'Test Agent', handle: uniq('agent'), ...data } as any,
  })
}

export async function createSession(
  opts: { userId?: string; agentId?: string } & Record<string, unknown> = {}
) {
  const { userId, agentId, ...rest } = opts
  await ensureExecutionSite()
  const resolvedUserId = userId ?? (await createUser()).id
  const resolvedAgentId = agentId ?? (await createAgent()).id
  return prisma.agentSession.create({
    data: { userId: resolvedUserId, agentId: resolvedAgentId, ...rest } as any,
  })
}

/**
 * A conversation's standing worker: a session with no task that serves a conversation.
 */
export function createWorkerSession(opts: { userId?: string; agentId?: string } & Record<string, unknown> = {}) {
  return createSession({ conversationId: uniq('conversation'), ...opts })
}

// createRun (seeded a real AgentRun row) removed — that model lives on site
// now (plan 5d-2 task 10 "shed"), dropped from hq's own schema.prisma. Tests
// that need a run now configure the siteRuntimeStore mocks directly instead.

/** A key of the form the app allows (two to six capital letters), unique enough for one test database. */
function projectKey(): string {
  return Array.from({ length: 6 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')
}

/**
 * A project names the machine its files live on — `createProject` (the action)
 * refuses one that doesn't, so a fixture project without a site is a row no
 * install could produce. Pass `executionSiteId` explicitly to place it on a
 * particular site, or `null` for the pre-registry shape the backfill tests
 * need.
 */
export async function createProject(data: Record<string, unknown> = {}) {
  const site = 'executionSiteId' in data ? null : await ensureExecutionSite()
  return prisma.project.create({
    data: {
      name: 'Test Project',
      key: projectKey(),
      ...(site ? { executionSiteId: site.id } : {}),
      ...data,
    } as any,
  })
}

export function createProduct(data: Record<string, unknown> = {}) {
  return prisma.product.create({
    data: { name: 'Test Product', slug: uniq('product'), ...data } as any,
  })
}

export function createProgram(data: Record<string, unknown> = {}) {
  return prisma.program.create({
    data: { name: 'Test Program', slug: uniq('program'), ...data } as any,
  })
}

/**
 * `prisma.task.create` for a fixture: a task is always on a board (adr-0097), so one given none goes on its
 * project's Project Tasks, made if the fixture project has none. `data` is untyped by design, like the factories above.
 */
export async function createTestTask(args: { data: Record<string, unknown> }) {
  const { data } = args
  const boardId = data.boardId ?? (typeof data.projectId === 'string' ? await projectTasksOf(data.projectId) : undefined)
  return prisma.task.create({ data: { ...data, boardId } as any })
}

/** The project's Project Tasks, made if the fixture project has none (as `ensureProjectTasks` does, without its imports). */
async function projectTasksOf(projectId: string): Promise<string> {
  const found = await prisma.board.findFirst({ where: { projectId, kind: 'PROJECT_TASKS' }, select: { id: true }, orderBy: { createdAt: 'asc' } })
  if (found) return found.id
  return (await prisma.board.create({ data: { ...projectTasksBoardCreate(), projectId }, select: { id: true } })).id
}

/**
 * A conversation in hq, in its opener's own space unless `home` says otherwise; the opener and the agent are made
 * when not given. Its messages go through the store (`conversations/store/messages.ts`), which seals them.
 */
export async function createConversation(
  opts: { openedById?: string; agentId?: string | null } & Record<string, unknown> = {}
) {
  const { openedById, agentId, ...rest } = opts
  const resolvedOpener = openedById ?? (await createUser()).id
  const resolvedAgent = agentId === undefined ? (await createAgent()).id : agentId
  return prisma.conversation.create({
    data: { home: 'PERSON', openedById: resolvedOpener, agentId: resolvedAgent, ...rest } as any,
  })
}
