/**
 * A run uses the model access of the person it is for, after its project's own (adr-0105), against the real
 * database and through the real dispatch: the project's first, then the run's person's own login, then their own
 * key, then the organisation's. A person's login goes only into their own harness home, so a task's run in a
 * project — which runs as the project — is given their key, never their login. Only the site is a fake.
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createSession, createWorkerSession, createUserWithRole, createTestTask } from '../../test/factories'
import { agentWithContent, apiKeyFor, dispatched, readyToDispatch } from './dispatchFixtures'
import { storeSubscription, orgKey } from '../../model-access/__tests__/runCredentialFixtures'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/workspaceStore')>()
  return { ...actual, listWorkspacesByOwner: vi.fn().mockResolvedValue([]) }
})

import { dispatchChatRun, dispatchTaskRun } from '../dispatchService'
import { acceptSubscriptionRefresh } from '../../sites/subscriptionGrants'

const login = (oauthJson: string) => ({ kind: 'subscription', provider: 'anthropic', oauthJson })
const key = (apiKey: string) => ({ kind: 'apiKey', provider: 'anthropic', apiKey })
const credential = () => dispatched().payload.context.credential
const problem = () => dispatched().payload.context.credentialProblem

beforeEach(async () => {
  await readyToDispatch()
})

let seq = 0
/** A project with two members — so the organisation has several people — and an agent and a board. */
async function teamProject() {
  const project = await createProject({ name: 'Web', key: `MA${++seq}`, slug: `ma-${seq}`, accessLevel: 'PRIVATE' })
  const owner = await createUserWithRole('MEMBER')
  const starter = await createUserWithRole('MEMBER')
  for (const userId of [owner.id, starter.id]) await prisma.projectMember.create({ data: { projectId: project.id, userId } })
  const agent = await agentWithContent()
  const board = await prisma.board.create({ data: { name: 'B', projectId: project.id, columns: [] } })
  return { project, owner, starter, agent, board }
}

/** A conversation `person` holds in the project: it runs as them, in their own harness home there. */
async function projectConversation(team: Awaited<ReturnType<typeof teamProject>>, person: { id: string }) {
  return createWorkerSession({
    agentId: team.agent.id, userId: person.id, sessionType: 'chat', title: 'Talk',
    primaryOwnerType: 'project', primaryOwnerId: team.project.id,
  })
}

async function projectTask(team: Awaited<ReturnType<typeof teamProject>>, data: Record<string, unknown> = {}) {
  return createTestTask({
    data: {
      title: 'Ship', projectId: team.project.id, number: ++seq, boardId: team.board.id,
      onBehalfOfUserId: team.owner.id, assignedAgentId: team.agent.id, ...data,
    },
  })
}

describe("a project's own model access comes first @SC-701", () => {
  it("uses the project's key over the person's own login", async () => {
    const team = await teamProject()
    await apiKeyFor('project', team.project.id, 'sk-project')
    await storeSubscription('user', team.owner.id, 'owner-oauth')
    const session = await projectConversation(team, team.owner)

    await dispatchChatRun(session.id, 'Hi', team.agent)

    expect(credential()).toEqual(key('sk-project'))
  })

  it("skips the project's subscription in an organisation of several people, and uses the person's login", async () => {
    const team = await teamProject()
    await storeSubscription('project', team.project.id, 'project-oauth')
    await storeSubscription('user', team.owner.id, 'owner-oauth')
    const session = await projectConversation(team, team.owner)

    await dispatchChatRun(session.id, 'Hi', team.agent)

    expect(credential()).toMatchObject(login('owner-oauth'))
  })
})

describe("then the person's own @SC-701", () => {
  it("uses the person's login when the project has nothing", async () => {
    const team = await teamProject()
    await storeSubscription('user', team.owner.id, 'owner-oauth')
    await orgKey('anthropic', 'sk-org')
    const session = await projectConversation(team, team.owner)

    await dispatchChatRun(session.id, 'Hi', team.agent)

    expect(credential()).toMatchObject(login('owner-oauth'))
  })

  it("uses the person's own key, ahead of the organisation's", async () => {
    const team = await teamProject()
    await apiKeyFor('user', team.owner.id, 'sk-owner')
    await orgKey('anthropic', 'sk-org')
    const session = await projectConversation(team, team.owner)

    await dispatchChatRun(session.id, 'Hi', team.agent)

    expect(credential()).toEqual(key('sk-owner'))
  })

  it("records the grant against the person's own login, so a refreshed token comes back to theirs", async () => {
    const team = await teamProject()
    const projectRow = await storeSubscription('project', team.project.id, 'project-oauth')
    const ownerRow = await storeSubscription('user', team.owner.id, 'owner-oauth')
    const session = await projectConversation(team, team.owner)
    await dispatchChatRun(session.id, 'Hi', team.agent)
    const { grantId } = credential() as { grantId: string }

    const grant = await prisma.subscriptionGrant.findUniqueOrThrow({ where: { id: grantId } })
    expect(grant).toMatchObject({ credentialId: ownerRow.id, runnerKind: 'person', runnerId: team.owner.id })

    const expiresAt = Date.now() + 8 * 60 * 60 * 1000
    const refreshed = JSON.stringify({ claudeAiOauth: { accessToken: 'a2', refreshToken: 'r2', expiresAt } })
    expect(await acceptSubscriptionRefresh(dispatched().siteId, { grantId, oauthJson: refreshed, expiresAt })).toBe('accepted')
    expect((await prisma.modelCredential.findUniqueOrThrow({ where: { id: ownerRow.id } })).expiresAt).toEqual(new Date(expiresAt))
    expect((await prisma.modelCredential.findUniqueOrThrow({ where: { id: projectRow.id } })).expiresAt).toBeNull()
  })
})

describe("then the organisation's @SC-701", () => {
  it("uses the organisation's key when neither the project nor the person has anything", async () => {
    const team = await teamProject()
    await orgKey('anthropic', 'sk-org')
    const session = await projectConversation(team, team.owner)

    await dispatchChatRun(session.id, 'Hi', team.agent)

    expect(credential()).toEqual(key('sk-org'))
  })

  it('says the order in plain words when nothing is usable @SC-706', async () => {
    const team = await teamProject()
    const session = await projectConversation(team, team.owner)

    await dispatchChatRun(session.id, 'Hi', team.agent)

    expect(credential()).toBeNull()
    expect(problem()).toContain("uses the project's own model access first, then the person it is for")
    expect(problem()).toContain('Settings › Your model logins')
  })
})

describe("a task's run is the person's it is for @SC-702", () => {
  it('uses the key of the person who started it, not the task person', async () => {
    const team = await teamProject()
    await apiKeyFor('user', team.owner.id, 'sk-owner')
    await apiKeyFor('user', team.starter.id, 'sk-starter')
    const task = await projectTask(team, { runOnBehalfOfUserId: team.starter.id })

    await dispatchTaskRun(task.id, team.agent, 'person')

    expect(credential()).toEqual(key('sk-starter'))
  })

  it("uses the task person's key for a run nobody started", async () => {
    const team = await teamProject()
    await apiKeyFor('user', team.owner.id, 'sk-owner')
    await apiKeyFor('user', team.starter.id, 'sk-starter')
    const task = await projectTask(team, { runOnBehalfOfUserId: team.starter.id })

    await dispatchTaskRun(task.id, team.agent, 'pulse')

    expect(credential()).toEqual(key('sk-owner'))
  })

  it("uses the sender's key for a message into the task's conversation", async () => {
    const team = await teamProject()
    await apiKeyFor('user', team.owner.id, 'sk-owner')
    await apiKeyFor('user', team.starter.id, 'sk-starter')
    const task = await projectTask(team)
    const admin = await prisma.userSettings.findFirstOrThrow({ where: { role: 'ADMIN' } })
    const session = await createSession({
      userId: admin.userId, agentId: team.agent.id, sessionType: 'task', taskId: task.id,
      primaryOwnerType: 'project', primaryOwnerId: team.project.id,
    })

    await dispatchChatRun(session.id, 'Use the staging bucket', team.agent, null, { senderId: team.starter.id })

    expect(credential()).toEqual(key('sk-starter'))
  })

  it("never hands the person's login to a task's run in a project, which runs as the project, and says why", async () => {
    const team = await teamProject()
    await storeSubscription('user', team.starter.id, 'starter-oauth')
    const task = await projectTask(team, { runOnBehalfOfUserId: team.starter.id })

    await dispatchTaskRun(task.id, team.agent, 'person')

    expect(credential()).toBeNull()
    expect(problem()).toContain("Your own Claude login is not used for a task's runs in a project")
  })
})

describe("a routine's run is its person's @SC-702", () => {
  async function routineRound(projectId: string, personId: string, agentId: string, boardId: string | null) {
    const routine = await prisma.routine.create({
      data: {
        projectId, title: 'Weekly report', onBehalfOfUserId: personId, assignedAgentId: agentId,
        scheduleAt: new Date(), scheduleRule: { every: 'week' }, scheduleTimezone: 'UTC',
      },
    })
    return createTestTask({
      data: { title: 'Weekly report', projectId, number: ++seq, boardId, onBehalfOfUserId: personId, assignedAgentId: agentId, routineId: routine.id },
    })
  }

  it("uses the routine's person's key in a shared project", async () => {
    const team = await teamProject()
    await apiKeyFor('user', team.starter.id, 'sk-starter')
    await apiKeyFor('user', team.owner.id, 'sk-owner')
    const round = await routineRound(team.project.id, team.starter.id, team.agent.id, team.board.id)

    await dispatchTaskRun(round.id, team.agent, 'schedule')

    expect(credential()).toEqual(key('sk-starter'))
  })

  it("uses the routine's person's own login in their personal project", async () => {
    const person = await createUserWithRole('MEMBER')
    const personal = await createProject({ name: 'Mine', key: `ME${++seq}`, personalOwnerId: person.id, personalSpace: true, accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: personal.id, userId: person.id } })
    const agent = await agentWithContent()
    await storeSubscription('user', person.id, 'person-oauth')
    const round = await routineRound(personal.id, person.id, agent.id, null)

    await dispatchTaskRun(round.id, agent, 'schedule')

    expect(credential()).toMatchObject(login('person-oauth'))
  })
})

describe("another person's login is never handed over @SC-703", () => {
  it("a conversation uses its own person's, never another member's login", async () => {
    const team = await teamProject()
    await storeSubscription('user', team.starter.id, 'starter-oauth')
    await orgKey('anthropic', 'sk-org')
    const session = await projectConversation(team, team.owner)

    await dispatchChatRun(session.id, 'Hi', team.agent)

    expect(credential()).toEqual(key('sk-org'))
  })

  it("a task's run nobody started uses neither the starter's nor the task person's login", async () => {
    const team = await teamProject()
    await storeSubscription('user', team.owner.id, 'owner-oauth')
    await storeSubscription('user', team.starter.id, 'starter-oauth')
    await orgKey('anthropic', 'sk-org')
    const task = await projectTask(team, { runOnBehalfOfUserId: team.starter.id })

    await dispatchTaskRun(task.id, team.agent, 'pulse')

    expect(credential()).toEqual(key('sk-org'))
  })
})
