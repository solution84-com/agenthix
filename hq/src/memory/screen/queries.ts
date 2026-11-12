import { HttpError, prisma } from 'wasp/server'
import type { GetMemory, GetMemoryChoices, GetMemoryMeasurements } from 'wasp/server/operations'
import type { GetMemoryArgs, MemoryChoices, MemoryItemView, MemoryMeasurements, MemoryPlaceView } from '../../shared/memory/protocol'
import { matchesWords } from './filters'
import { isOrgAdmin } from '../../projects/membership'
import { signedIn } from './access'
import { memoryMeasurements } from './measurements'
import { VIEW_SELECT, idsOf, namesOf, viewsOf } from './views'

const KINDS: readonly string[] = ['FACT', 'RULE']
const optionalString = (v: unknown) => v === undefined || typeof v === 'string'

/**
 * The signed-in person's own memories, newest first, matched exactly by id, agent, place, kind and tag when asked,
 * and by the words of their title, body and tags.
 */
export const getMemory: GetMemory<GetMemoryArgs, MemoryItemView[]> = async (args, context) => {
  const userId = signedIn(context)
  if (args?.place && args.place.type !== 'user' && args.place.type !== 'project') throw new HttpError(400, 'Unknown kind of place')
  if (args?.place && (typeof args.place.id !== 'string' || !args.place.id)) throw new HttpError(400, 'Unknown place')
  if (args?.agentId !== undefined && args.agentId !== null && typeof args.agentId !== 'string') throw new HttpError(400, 'Unknown agent')
  if (args?.kind !== undefined && !KINDS.includes(args.kind)) throw new HttpError(400, 'Unknown kind of memory')
  if (!optionalString(args?.id) || !optionalString(args?.tag) || !optionalString(args?.words)) throw new HttpError(400, 'Unreadable filter')
  const rows = await prisma.memoryItem.findMany({
    where: {
      userId,
      ...(args?.id !== undefined ? { id: args.id } : {}),
      ...(args?.includeArchived ? {} : { archived: false }),
      ...(args?.agentId !== undefined ? { agentId: args.agentId } : {}),
      ...(args?.place !== undefined
        ? args.place ? { placeType: args.place.type, placeId: args.place.id } : { placeType: null, placeId: null }
        : {}),
      ...(args?.kind ? { kind: args.kind } : {}),
      ...(args?.tag ? { tags: { has: args.tag } } : {}),
    },
    select: VIEW_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  })
  return viewsOf(args?.words ? rows.filter(r => matchesWords(r, args.words!)) : rows)
}

/** The recall measurements and the embedding model: the organisation's admins'. */
export const getMemoryMeasurements: GetMemoryMeasurements<void, MemoryMeasurements> = async (_args, context) => {
  const userId = signedIn(context)
  if (!(await isOrgAdmin(userId))) throw new HttpError(403, 'Only an organisation admin can see how memory is measured')
  return memoryMeasurements()
}

/** The menus' values: every agent, place and tag the person's own memories name, archived ones included. */
export const getMemoryChoices: GetMemoryChoices<void, MemoryChoices> = async (_args, context) => {
  const userId = signedIn(context)
  const rows = await prisma.memoryItem.findMany({ where: { userId }, select: { agentId: true, placeType: true, placeId: true, tags: true } })
  const places = new Map<string, { type: string; id: string }>()
  for (const r of rows) if (r.placeType && r.placeId) places.set(`${r.placeType}:${r.placeId}`, { type: r.placeType, id: r.placeId })
  const { agent, place } = await namesOf(
    idsOf(rows.map(r => r.agentId)),
    [...places.values()].filter(p => p.type === 'project').map(p => p.id),
  )
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name)
  return {
    agents: idsOf(rows.map(r => r.agentId)).map(id => agent(id)!).sort(byName),
    places: [...places.values()].map(p => place(p.type, p.id)).filter((p): p is MemoryPlaceView => !!p).sort(byName),
    tags: [...new Set(rows.flatMap(r => r.tags))].sort(),
  }
}
