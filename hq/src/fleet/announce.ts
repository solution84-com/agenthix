/**
 * Telling every fleet admin and every organisation admin (host-management spec §4: role grants, remote sessions,
 * exports and erases are announced to both). One notification each, however many roles they hold.
 */
import { prisma } from 'wasp/server'
import { notificationsChanged } from '../server/personEvents'

export type Announcement = { type: string; title: string; body: string; actionUrl?: string }

/** Who an announcement reaches: everyone still here who holds either role. */
export async function announcementRecipients(): Promise<string[]> {
  const active = { deactivatedAt: null, erasedAt: null }
  const rows = await prisma.user.findMany({
    where: { ...active, OR: [{ fleetAdmin: true }, { settings: { role: 'ADMIN' } }] },
    select: { id: true },
  })
  return rows.map(r => r.id)
}

/** `also`: people told besides, such as someone who has just lost the role the announcement is about. */
export async function announce(notice: Announcement, also: string[] = []): Promise<string[]> {
  const recipients = [...new Set([...(await announcementRecipients()), ...also])]
  if (recipients.length === 0) return []
  await prisma.notification.createMany({
    data: recipients.map(userId => ({
      userId,
      type: notice.type,
      title: notice.title,
      body: notice.body,
      actionUrl: notice.actionUrl ?? null,
      actionLabel: notice.actionUrl ? 'Open' : null,
    })),
  })
  notificationsChanged(recipients)
  return recipients
}
