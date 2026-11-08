/**
 * What a project is, for someone deciding whether to join it (adr-0099, spec
 * §3 People): its description, lead, product, site and start, its people and
 * agents, and how busy it is — never its work. Readable by its members and,
 * for an open project, by anyone in the organisation; a private project a
 * person is not in answers as a missing one.
 *
 * The tools panel's People and Agents rows read the same counts and avatars
 * (`getProjectPanelRows`). Everything here is hq's own records, so neither
 * read asks a site anything.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetProjectPreview, GetProjectPanelRows } from 'wasp/server/operations'
import { isProjectMember, isProjectVisibleTo } from './membership'
import { projectLeadOf } from './projectLead'
import { OPEN_TASK } from './openTaskHandover'
import { ACTIVE_PERSON, peopleByIds } from '../server/identity/people'
import type { PersonSummary } from '../server/identity/personSummary'
import { siteAsShown } from '../shared/siteName'

export const PANEL_AVATARS = 4

export type AgentFace = { id: string; name: string; handle: string; role: string | null; avatarUrl: string | null }

export type ProjectPanelRows = {
  people: { count: number; avatars: PersonSummary[] }
  agents: { count: number; avatars: AgentFace[] }
}

export type ProjectPreview = {
  project: {
    id: string
    key: string
    name: string
    description: string | null
    accessLevel: 'OPEN' | 'PRIVATE'
    startedAt: Date
    product: { id: string; name: string; slug: string } | null
    site: { id: string; label: string } | null
    lead: PersonSummary | null
    defaultAgentId: string | null
  }
  isMember: boolean
  /** An open project the person is not in yet. */
  canJoin: boolean
  people: PersonSummary[]
  agents: AgentFace[]
  /** Counts only, never a task's id, key or title: this answer also goes to people who are not in the project. */
  taskCount: number
  openTaskCount: number
  runningCount: number
  doneCount: number
  boardCount: number
  /** The latest run in the project, conversations and tasks alike; null when nothing has run. */
  lastRunAt: Date | null
}

type Ctx = { user?: { id: string } | null }
/** A project by id, or by key as the routes name it. */
export type ProjectRef = { projectId?: string; key?: string }

const AGENT_FACE = { id: true, name: true, handle: true, role: true, avatarUrl: true } as const

/** The project named by id or key, when the person may see it; a hidden one answers as a missing one. */
async function requireVisible(ref: ProjectRef, userId: string): Promise<string> {
  let projectId = ref.projectId
  if (!projectId && ref.key) projectId = (await prisma.project.findUnique({ where: { key: ref.key }, select: { id: true } }))?.id
  if (!ref.projectId && !ref.key) throw new HttpError(400, 'A project id or key is required')
  if (!projectId || !(await isProjectVisibleTo(projectId, userId))) throw new HttpError(404, 'Project not found')
  return projectId
}

/** The project's members who have not left, admins first, then by when they joined. */
async function membersOf(projectId: string): Promise<PersonSummary[]> {
  const rows = await prisma.projectMember.findMany({
    where: { projectId, user: ACTIVE_PERSON },
    select: { userId: true },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })
  const people = await peopleByIds(rows.map(r => r.userId))
  return rows.map(r => people.get(r.userId)!)
}

async function agentsOf(projectId: string): Promise<AgentFace[]> {
  const rows = await prisma.projectAgent.findMany({
    where: { projectId },
    select: { agent: { select: AGENT_FACE } },
    orderBy: { createdAt: 'asc' },
  })
  return rows.map(r => r.agent)
}

export const getProjectPanelRows: GetProjectPanelRows<ProjectRef, ProjectPanelRows> = async (ref, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const projectId = await requireVisible(ref, context.user.id)
  const [people, agents] = await Promise.all([membersOf(projectId), agentsOf(projectId)])
  return {
    people: { count: people.length, avatars: people.slice(0, PANEL_AVATARS) },
    agents: { count: agents.length, avatars: agents.slice(0, PANEL_AVATARS) },
  }
}

export const getProjectPreview: GetProjectPreview<ProjectRef, ProjectPreview> = async (ref, context: Ctx) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const me = context.user.id
  const projectId = await requireVisible(ref, me)
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: {
      id: true, key: true, name: true, description: true, accessLevel: true, createdAt: true,
      personalOwnerId: true, leadUserId: true, defaultAgentId: true,
      product: { select: { id: true, name: true, slug: true } },
      executionSite: { select: { id: true, label: true, isDefault: true } },
    },
  })
  const [isMember, people, agents, taskCount, openTaskCount, runningCount, doneCount, boardCount, lastTask, lastSession, lead] = await Promise.all([
    isProjectMember(projectId, me),
    membersOf(projectId),
    agentsOf(projectId),
    prisma.task.count({ where: { projectId, archived: false } }),
    prisma.task.count({ where: { projectId, ...OPEN_TASK } }),
    prisma.task.count({ where: { projectId, archived: false, runState: 'RUN_ACTIVE' } }),
    prisma.task.count({ where: { projectId, archived: false, state: 'DONE' } }),
    prisma.board.count({ where: { projectId } }),
    prisma.task.aggregate({ where: { projectId }, _max: { lastWorkedAt: true } }),
    prisma.agentSession.aggregate({
      where: { primaryOwnerType: 'project', primaryOwnerId: projectId },
      _max: { updatedAt: true },
    }),
    projectLeadOf(project),
  ])
  const lastRuns = [lastTask._max.lastWorkedAt, lastSession._max.updatedAt].filter((d): d is Date => d !== null)
  return {
    project: {
      id: project.id, key: project.key, name: project.name, description: project.description,
      accessLevel: project.accessLevel, startedAt: project.createdAt, product: project.product,
      site: siteAsShown(project.executionSite), lead: lead?.person ?? null,
      defaultAgentId: project.defaultAgentId,
    },
    isMember,
    canJoin: !isMember && project.accessLevel === 'OPEN' && !project.personalOwnerId,
    people,
    agents,
    taskCount,
    openTaskCount,
    runningCount,
    doneCount,
    boardCount,
    lastRunAt: lastRuns.length > 0 ? new Date(Math.max(...lastRuns.map(d => d.getTime()))) : null,
  }
}
