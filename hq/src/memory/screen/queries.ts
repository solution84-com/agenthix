import { HttpError, prisma } from 'wasp/server'
import type { GetMemory, GetMemoryChoices, GetMemoryMeasurements } from 'wasp/server/operations'
import type { GetMemoryArgs, MemoryItemView, MemoryMeasurements } from '../../shared/memory/protocol'
import { isOrgAdmin } from '../../projects/membership'
import { screenTarget, signedIn } from './access'
import { memoryMeasurements } from './measurements'
import { VIEW_SELECT, viewsOf } from './views'

export const getMemory: GetMemory<GetMemoryArgs, MemoryItemView[]> = async (args, context) => {
  const userId = signedIn(context)
  const { target } = await screenTarget(userId, args)
  const rows = await prisma.memoryItem.findMany({
    where: { scopeKey: target.scopeKey, ...(args.includeArchived ? {} : { archived: false }) },
    select: VIEW_SELECT,
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
  })
  return viewsOf(rows)
}

/** The recall measurements and the embedding model: the organisation's admins'. */
export const getMemoryMeasurements: GetMemoryMeasurements<void, MemoryMeasurements> = async (_args, context) => {
  const userId = signedIn(context)
  if (!(await isOrgAdmin(userId))) throw new HttpError(403, 'Only an organisation admin can see how memory is measured')
  return memoryMeasurements()
}

export type MemoryChoices = {
  agents: { id: string; name: string }[]
  /** Places this person may curate an agent's memory in: their own space, and the projects they administer. */
  places: { type: 'user' | 'project'; id: string; name: string }[]
}

export const getMemoryChoices: GetMemoryChoices<void, MemoryChoices> = async (_args, context) => {
  const userId = signedIn(context)
  const [agents, projects] = await Promise.all([
    prisma.agent.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.project.findMany({
      where: { personalOwnerId: null },
      select: { id: true, name: true, members: { where: { userId }, select: { role: true } } },
      orderBy: { name: 'asc' },
    }),
  ])
  return {
    agents,
    places: [
      { type: 'user', id: userId, name: 'Your own space' },
      ...projects.filter(p => p.members.some(m => m.role === 'ADMIN')).map(p => ({ type: 'project' as const, id: p.id, name: p.name })),
    ],
  }
}
