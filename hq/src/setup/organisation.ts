/**
 * Setup's organisation step, beyond the name (setup spec, step 5): the time zone, and the default billing profile made
 * from the organisation's name. Until billing profiles have their own screens the row is made here.
 */
import { HttpError, prisma } from 'wasp/server'
import type { SaveSetupOrganisation } from 'wasp/server/operations'
import { isOrgAdmin } from '../projects/membership'

export function isTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 64) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

export const saveSetupOrganisation: SaveSetupOrganisation<{ timeZone: string }, { ok: true }> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  if (!(await isOrgAdmin(context.user.id))) throw new HttpError(403, 'Only an organisation admin sets up the organisation.')
  if (!isTimeZone(args?.timeZone)) throw new HttpError(400, 'That is not a time zone.')
  const org = await prisma.org.findFirst({ select: { id: true, name: true, setupCompletedAt: true } })
  if (!org) throw new HttpError(409, 'There is no organisation yet')
  await prisma.org.update({ where: { id: org.id }, data: { timeZone: args.timeZone } })
  const existing = await prisma.billingProfile.findFirst({ where: { isDefault: true, archivedAt: null } })
  if (!existing) await prisma.billingProfile.create({ data: { name: org.name, isDefault: true, createdById: context.user.id } })
  else if (!org.setupCompletedAt && existing.name !== org.name) await prisma.billingProfile.update({ where: { id: existing.id }, data: { name: org.name } })
  return { ok: true }
}
