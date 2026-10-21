/**
 * Pin, unpin and reorder (every screen reviewed spec §9). Each acts only on the
 * caller's own pins; nothing here can read or change anyone else's.
 */
import type { PinItem, UnpinItem, ReorderPins } from 'wasp/server/operations'
import { HttpError, prisma } from 'wasp/server'
import { requireVisibleItem } from './pinnedItems'
import { isPinKind, type PinArgs } from './pinTypes'

function requirePinArgs(args: PinArgs): void {
  if (!isPinKind(args?.kind)) throw new HttpError(400, 'A pin is a project, a board or an agent')
  if (typeof args.itemId !== 'string' || args.itemId === '') throw new HttpError(400, 'An item id is required')
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
}

/** Adds the item at the end of the caller's pins; pinning it again changes nothing. */
export const pinItem: PinItem<PinArgs, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  requirePinArgs(args)
  const userId = context.user.id
  await requireVisibleItem(args.kind, args.itemId, userId)

  const existing = await prisma.pin.findUnique({
    where: { userId_kind_itemId: { userId, kind: args.kind, itemId: args.itemId } },
    select: { id: true },
  })
  if (existing) return

  const last = await prisma.pin.aggregate({ where: { userId }, _max: { position: true } })
  try {
    await prisma.pin.create({
      data: { userId, kind: args.kind, itemId: args.itemId, position: (last._max.position ?? -1) + 1 },
    })
  } catch (err) {
    // A second tab pinning the same item at the same moment: it is pinned either way.
    if (!isUniqueViolation(err)) throw err
  }
}

/** Needs no visibility: a person can always take away a pin they can no longer open. */
export const unpinItem: UnpinItem<PinArgs, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  requirePinArgs(args)
  await prisma.pin.deleteMany({ where: { userId: context.user.id, kind: args.kind, itemId: args.itemId } })
}

/**
 * Puts the named pins first, in the order given. Pins left out keep their
 * order after them, which includes the ones the person cannot see at the moment
 * and so could not have placed.
 */
export const reorderPins: ReorderPins<{ pinIds: string[] }, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401, 'Not authenticated')
  const pinIds = args?.pinIds
  if (!Array.isArray(pinIds) || pinIds.some((id) => typeof id !== 'string')) {
    throw new HttpError(400, 'pinIds must be a list of pin ids')
  }
  if (new Set(pinIds).size !== pinIds.length) throw new HttpError(400, 'A pin is named more than once')

  const userId = context.user.id
  const own = await prisma.pin.findMany({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  })
  const ownIds = new Set(own.map((p) => p.id))
  if (pinIds.some((id) => !ownIds.has(id))) throw new HttpError(404, 'Pin not found')

  const named = new Set(pinIds)
  const order = [...pinIds, ...own.map((p) => p.id).filter((id) => !named.has(id))]
  await prisma.$transaction(
    order.map((id, position) => prisma.pin.update({ where: { id }, data: { position } })),
  )
}
