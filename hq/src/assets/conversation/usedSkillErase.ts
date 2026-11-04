/**
 * Erasing a person (adr-0100) takes the content hq kept of their own skills: their space's skills and their own
 * projects', with every version and draft, so nothing of what they wrote can be opened from a run that used it (spec
 * part 5 *Seeing it used*, security review M6). The runs keep the identity and fingerprint the site recorded, which
 * now open nothing. The content is released for the sweep, which keeps it only while anything else still names it.
 */
import type { Prisma } from '@prisma/client'

type Place = { type: 'user' | 'project'; id: string }

const wherePlaces = (places: Place[]): Prisma.PlaceSkillWhereInput => ({
  OR: places.map(p => ({ placeType: p.type, placeId: p.id })),
})

/** Read before the erase's transaction: the writes to put in it. */
export async function personSkillErasure(db: Prisma.TransactionClient, places: Place[]): Promise<Prisma.PrismaPromise<unknown>[]> {
  if (places.length === 0) return []
  const where = wherePlaces(places)
  const [versions, drafts] = await Promise.all([
    db.placeSkillVersion.findMany({ where: { placeSkill: where }, select: { digest: true } }),
    db.draft.findMany({ where: { placeSkill: where }, select: { digest: true, revisions: { select: { digest: true } } } }),
  ])
  const digests = [...new Set([
    ...versions.map(v => v.digest),
    ...drafts.flatMap(d => [d.digest, ...d.revisions.map(r => r.digest)]),
  ])]
  return [
    db.placeSkill.deleteMany({ where }),
    ...(digests.length ? [db.packageContent.updateMany({ where: { digest: { in: digests } }, data: { releasedAt: new Date() } })] : []),
  ]
}
