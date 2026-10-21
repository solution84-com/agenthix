/**
 * Setup runs once per hq, for its first admin only (getting-in spec, The first
 * admin): You · Your organisation · Model access. The first admin is whoever
 * made their account with the first-admin link; an admin invited later accepts
 * an invitation like anyone else and is never sent through setup. Setup is done
 * when that admin finishes or skips its last step, recorded on the organisation.
 */
import { prisma } from 'wasp/server'

export async function needsSetup(userId: string): Promise<boolean> {
  const [org, firstAdmin] = await Promise.all([
    prisma.org.findFirst({ select: { setupCompletedAt: true } }),
    prisma.invite.findFirst({ where: { kind: 'FIRST_ADMIN', consumedBy: userId }, select: { id: true } }),
  ])
  if (!firstAdmin || org?.setupCompletedAt) return false
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { role: true } })
  return settings?.role === 'ADMIN'
}

/** Records setup as done; only the first admin, and only once. */
export async function finishSetup(userId: string, now = new Date()): Promise<boolean> {
  if (!(await needsSetup(userId))) return false
  const { count } = await prisma.org.updateMany({ where: { setupCompletedAt: null }, data: { setupCompletedAt: now } })
  return count > 0
}
