/**
 * The organisation's own publisher name, the segment of everything made here (spec part 2 *Identity*): a slug of its
 * name, written once on the organisation when first needed and never changed afterwards, so what it made keeps its
 * identity when the organisation is renamed. It never takes a reserved name or one a trusted publisher holds.
 */
import { isReservedPublisher } from '@agenthix/core'
import type { Db } from '../packages/packageStore'
import { slugOf } from './publisherNames'

export class NoOrganisationError extends Error {
  constructor() { super('Create the organisation first: what it makes is published under its name. Nothing was changed.') }
}

export async function organisationPublisher(db: Db): Promise<string> {
  const org = await db.org.findFirst({ select: { id: true, name: true, publisherName: true } })
  if (!org) throw new NoOrganisationError()
  if (org.publisherName) return org.publisherName
  const taken = new Set((await db.trustedPublisher.findMany({ select: { name: true } })).map(p => p.name))
  const base = slugOf(org.name) || 'organisation'
  let name = base
  for (let n = 2; isReservedPublisher(name) || taken.has(name); n++) name = `${base.slice(0, 54).replace(/-+$/, '')}-org${n === 2 ? '' : `-${n}`}`
  // Only the first writer sets it; everyone then reads what was written.
  await db.org.updateMany({ where: { id: org.id, publisherName: null }, data: { publisherName: name } })
  const written = await db.org.findUniqueOrThrow({ where: { id: org.id }, select: { publisherName: true } })
  return written.publisherName ?? name
}
