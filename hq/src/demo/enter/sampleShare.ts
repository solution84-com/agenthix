/**
 * What a visitor gets of the sample organisation as they enter (live demo spec, *Getting in*):
 *
 * - **A viewer of every sample project.** The sample's projects are private, so nobody joins them; a viewer reads
 *   everything a member reads and changes nothing (ADR-0102), so the product's own roles keep the sample as seeded.
 *   A personal project stays out, and so does any project made after the first visitor entered.
 * - **The sample admins' project pins**, as the visitor's own.
 *
 * The admins' waiting notifications are not copied: each asks for something only a member of the project may do.
 * Tasks, routines, runs and conversations stay on the sample's people; a visitor works in their own space.
 */
import type { Prisma } from '@prisma/client'
import { writePerson } from '../../org/teams/writeThrough'
import { VISITOR_USER } from '../visitors'

type Tx = Prisma.TransactionClient

/**
 * The sample's projects: every project that is no one's own space. A visitor cannot make one (the demo guard refuses
 * `createProject`), so these are the ones the seed made.
 */
async function sampleProjects(tx: Tx): Promise<string[]> {
  const rows = await tx.project.findMany({ where: { personalOwnerId: null }, select: { id: true }, orderBy: { createdAt: 'asc' } })
  return rows.map(r => r.id)
}

/** Gives the visitor `userId`, made in this same transaction, their share of the sample. */
export async function shareTheSample(tx: Tx, userId: string): Promise<{ projects: number; pins: number }> {
  const projects = await sampleProjects(tx)
  for (const projectId of projects) await writePerson(tx, projectId, userId, 'VIEWER')

  const admins = (await tx.userSettings.findMany({ where: { role: 'ADMIN', user: { NOT: VISITOR_USER } }, select: { userId: true } })).map(a => a.userId)
  if (admins.length === 0) return { projects: projects.length, pins: 0 }

  const pinned = await tx.pin.findMany({
    where: { userId: { in: admins }, kind: 'PROJECT', itemId: { in: projects } },
    orderBy: { position: 'asc' },
    select: { itemId: true },
  })
  const pins = [...new Set(pinned.map(p => p.itemId))]
  if (pins.length) await tx.pin.createMany({ data: pins.map((itemId, position) => ({ userId, kind: 'PROJECT' as const, itemId, position })) })

  return { projects: projects.length, pins: pins.length }
}
