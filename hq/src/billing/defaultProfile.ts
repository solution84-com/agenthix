/**
 * There is always exactly one default billing profile (part 5). Setup makes it from the organisation's name; anything
 * that needs it before then adopts the one setup made, or makes it the same way. The partial unique index
 * `BillingProfile_default_key` keeps it to one, so two callers racing both end up with the same row.
 */
import { prisma } from 'wasp/server'
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

const FALLBACK_NAME = 'Organisation'

export async function ensureDefaultBillingProfile(db: Db = prisma): Promise<string> {
  const existing = await db.billingProfile.findFirst({ where: { isDefault: true }, select: { id: true } })
  if (existing) return existing.id
  const org = await db.org.findFirst({ select: { name: true } })
  await db.billingProfile.createMany({ data: [{ name: org?.name || FALLBACK_NAME, isDefault: true }], skipDuplicates: true })
  const made = await db.billingProfile.findFirst({ where: { isDefault: true }, select: { id: true } })
  if (made) return made.id
  // A profile not archived already bears the name: it becomes the default.
  const named = await db.billingProfile.findFirst({ where: { archivedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (!named) throw new Error('No default billing profile could be made')
  await db.billingProfile.update({ where: { id: named.id }, data: { isDefault: true } })
  return named.id
}
