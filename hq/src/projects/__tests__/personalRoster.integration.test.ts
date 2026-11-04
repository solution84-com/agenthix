/**
 * A personal place's agent roster (Your space, a personal project): its own list of agents, apart from people.
 * Kernel is on it from when the place is made; only its owner adds and removes; tasks and routines take agents
 * from it, as in a shared project. Against the real test database, through the actions a person uses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createAgent, createUser, createUserWithRole, ensureExecutionSite } from '../../test/factories'

vi.mock('../../storage/locationFileStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/locationFileStore')>()),
  seedFilesOnSite: vi.fn().mockResolvedValue({ written: [], skipped: [] }),
  ensureDirOnSite: vi.fn().mockResolvedValue({ created: true }),
  removeLocationOnSite: vi.fn().mockResolvedValue({ removed: true }),
}))
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: { isOnline: vi.fn().mockReturnValue(false), request: vi.fn() } }))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../server/socket', () => ({ emitTaskUpdated: vi.fn(), emitTasksToHq: vi.fn() }))

import { createPersonalProject } from '../personalProjectActions'
import { addAgentToProject, removeAgentFromProject, createTask } from '../actions'
import { ensurePersonalProject } from '../personalProject'
import { getProject } from '../queries'
import { KERNEL_HANDLE } from '../../agents/kernelGuards'

const as = (user: { id: string }) => ({ user, entities: { Project: prisma.project } }) as any
const roster = async (projectId: string) =>
  (await prisma.projectAgent.findMany({ where: { projectId }, select: { agentId: true } })).map(r => r.agentId)

beforeEach(async () => {
  await ensureExecutionSite({ siteId: 's1', protocolVersion: SITE_PROTOCOL_VERSION })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('Kernel on a personal place’s roster', () => {
  it('is on Your space’s roster from when the account’s space is made, as its default agent', async () => {
    const kernel = await createAgent({ handle: KERNEL_HANDLE, isKernel: true })
    const person = await createUser()

    const space = await ensurePersonalProject(person.id)

    expect(await roster(space.id)).toEqual([kernel.id])
    expect((await prisma.project.findUniqueOrThrow({ where: { id: space.id } })).defaultAgentId).toBe(kernel.id)
  })

  it('is on each personal project’s roster from when it is made', async () => {
    const kernel = await createAgent({ handle: KERNEL_HANDLE, isKernel: true })
    const person = await createUser()

    const made = await createPersonalProject({ name: 'Tax return 2026' }, as(person))

    expect(await roster(made.id)).toEqual([kernel.id])
  })

  it('leaves the roster empty before Kernel exists, rather than failing to make the place', async () => {
    const person = await createUser()
    const space = await ensurePersonalProject(person.id)
    expect(await roster(space.id)).toEqual([])
  })
})

describe('changing a personal place’s roster', () => {
  async function ownerWithProject() {
    const owner = await createUser()
    const project = await createPersonalProject({ name: 'Research' }, as(owner))
    return { owner, project }
  }

  it('lets its owner add any agent and remove it again', async () => {
    const { owner, project } = await ownerWithProject()
    const agent = await createAgent()

    await addAgentToProject({ projectId: project.id, agentId: agent.id }, as(owner))
    expect(await roster(project.id)).toContain(agent.id)
    const seen = await getProject({ projectId: project.id } as any, as(owner))
    expect(seen.agents.map((a: any) => a.agentId)).toContain(agent.id)

    await removeAgentFromProject({ projectId: project.id, agentId: agent.id, openTasksTo: null, newDefaultAgentId: null }, as(owner))
    expect(await roster(project.id)).not.toContain(agent.id)
  })

  it('refuses anyone but its owner, an organisation admin included, and changes nothing', async () => {
    const { project } = await ownerWithProject()
    const agent = await createAgent()
    const stranger = await createUser()
    const admin = await createUserWithRole('ADMIN')

    for (const who of [stranger, admin]) {
      await expect(addAgentToProject({ projectId: project.id, agentId: agent.id }, as(who))).rejects.toMatchObject({ statusCode: 403 })
      await expect(removeAgentFromProject({ projectId: project.id, agentId: agent.id, openTasksTo: null }, as(who))).rejects.toMatchObject({ statusCode: 403 })
    }
    expect(await roster(project.id)).not.toContain(agent.id)
  })
})

describe('tasks and routines in a personal place take agents from its roster', () => {
  it('lets a task there be given to an agent on the roster, and refuses one that is not', async () => {
    const owner = await createUser()
    const space = await ensurePersonalProject(owner.id)
    const onRoster = await createAgent()
    const off = await createAgent()
    await addAgentToProject({ projectId: space.id, agentId: onRoster.id }, as(owner))

    const task = await createTask({ projectId: space.id, title: 'Write it up', assignedAgentId: onRoster.id } as any, as(owner))
    expect(task.assignedAgentId).toBe(onRoster.id)
    await expect(createTask({ projectId: space.id, title: 'Other', assignedAgentId: off.id } as any, as(owner)))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})
