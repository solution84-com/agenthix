/**
 * The browser's operations for the Workroom and Workrooms (spec D17–D19). Reading a project's Workroom is for anyone
 * who can see the project; Workrooms reads the viewer's own runs in the projects they are a member of and their own
 * space. Reordering a Workroom's agents, and stopping one's own runs, are for whoever may work in the project.
 * Starting and stopping an agent are the start lane's (`agentLineOperations.ts`); Stop every run is `stopPlaceRuns`.
 */
import { HttpError, prisma } from 'wasp/server'
import type { GetWorkroom, GetWorkrooms, ReorderWorkroomAgents, StopMyRuns } from 'wasp/server/operations'
import { entitledProjectsFilter, requireMayWorkInProject } from '../membership'
import { requireProjectVisible } from '../resourceEntitlement'
import { personName } from '../../sessions/transcriptAuthors'
import { readWorkrooms } from './workroomRead'
import { addCounts, todayWindow } from './workroomRules'
import { stopMyRuns as stopMine } from './stopMyRuns'
import type {
  GetWorkroomArgs, GetWorkroomsArgs, ReorderWorkroomAgentsArgs, StopMyRunsArgs, StopMyRunsResult, WorkroomProject, WorkroomsView,
} from './workroomTypes'

/** The most projects Workrooms shows; a person in more sees the ones touched most recently. */
export const WORKROOMS_PROJECT_LIMIT = 30

const MAX_AGENTS = 200

function requireId(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) throw new HttpError(400, `${what} is needed. Nothing was changed.`)
  return value
}

export const getWorkroom: GetWorkroom<GetWorkroomArgs, WorkroomProject> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const projectId = requireId(args?.projectId, 'A project')
  await requireProjectVisible(projectId, context.user.id)
  const now = new Date()
  const [workroom] = await readWorkrooms([projectId], context.user.id, { mine: false, from: todayWindow(args.todayFrom, now), now })
  if (!workroom) throw new HttpError(404, 'Project not found')
  return workroom
}

export const getWorkrooms: GetWorkrooms<GetWorkroomsArgs, WorkroomsView> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const me = context.user.id
  const now = new Date()
  const projects = await prisma.project.findMany({
    where: { AND: [entitledProjectsFilter(me), { OR: [{ personalOwnerId: null }, { personalOwnerId: me, personalSpace: true }] }] },
    orderBy: { updatedAt: 'desc' },
    take: WORKROOMS_PROJECT_LIMIT,
    select: { id: true, name: true, personalOwnerId: true, _count: { select: { agents: true } } },
  })
  // Each project by name, the person's own space last; a project with no agents has no Workroom to show.
  const ordered = [
    ...projects.filter(p => p.personalOwnerId === null && p._count.agents > 0).sort((a, b) => a.name.localeCompare(b.name)),
    ...projects.filter(p => p.personalOwnerId !== null),
  ]
  const rooms = await readWorkrooms(ordered.map(p => p.id), me, { mine: true, from: todayWindow(args?.todayFrom, now), now })
  const shown = rooms.filter(r => !r.personal || r.agents.length > 0).map(r => (r.personal ? { ...r, projectName: 'Your space' } : r))
  const counts = addCounts(shown.map(r => r.counts))
  const unanswered = [...new Map(shown.flatMap(r => r.unanswered).map(u => [u.siteId, u])).values()]
  return { counts, projects: shown, unanswered }
}

export const reorderWorkroomAgents: ReorderWorkroomAgents<ReorderWorkroomAgentsArgs, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const projectId = requireId(args?.projectId, 'A project')
  await requireMayWorkInProject(projectId, context.user.id, "Changing the order of this project's agents")
  const ids = Array.isArray(args.agentIds) ? args.agentIds : null
  if (!ids || ids.length > MAX_AGENTS || ids.some(id => typeof id !== 'string')) throw new HttpError(400, 'Name every agent in its new order. Nothing was changed.')
  const present = await prisma.projectAgent.findMany({ where: { projectId }, select: { agentId: true } })
  const known = new Set(present.map(a => a.agentId))
  if (new Set(ids).size !== ids.length || ids.length !== known.size || ids.some(id => !known.has(id))) {
    throw new HttpError(409, "The project's agents changed while you moved them. Look again, then move them. Nothing was changed.")
  }
  await prisma.$transaction(ids.map((agentId, position) =>
    prisma.projectAgent.update({ where: { projectId_agentId: { projectId, agentId } }, data: { position } })))
}

export const stopMyRuns: StopMyRuns<StopMyRunsArgs, StopMyRunsResult> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const projectId = args?.projectId == null ? undefined : requireId(args.projectId, 'A project')
  const agentId = args?.agentId == null ? undefined : requireId(args.agentId, 'An agent')
  if (agentId && !projectId) throw new HttpError(400, "An agent's runs are stopped in one project: name it. Nothing was changed.")
  if (projectId) await requireMayWorkInProject(projectId, context.user.id, 'Stopping your runs in this project')
  return stopMine(context.user.id, await personName(context.user.id), { projectId, agentId })
}
