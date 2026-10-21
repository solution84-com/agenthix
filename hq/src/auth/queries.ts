import { HttpError } from 'wasp/server'
import type { ListInvites } from 'wasp/server/operations'

type InviteRow = {
  id: string
  role: string
  /** Who it is for. */
  note: string | null
  /** Projects the person joins on accepting. Organisation › People reads `getOrgPeople`, which names them. */
  projectIds: string[]
  /** Null when it was made on hq's machine. */
  createdBy: string | null
  expiresAt: Date | null
  consumedAt: Date | null
  consumedBy: string | null
  revokedAt: Date | null
  createdAt: Date
}

export const listInvites: ListInvites<void, InviteRow[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401)
  const callerSettings = await context.entities.UserSettings.findFirst({ where: { userId: context.user.id } })
  if (callerSettings?.role !== 'ADMIN') throw new HttpError(403, 'Admin access required')

  // The token is never returned: only its hash is stored, and the link is shown once at creation.
  // The first-admin link is not an invitation anyone sends, so it is never listed.
  return context.entities.Invite.findMany({
    where: { kind: 'INVITATION' },
    select: {
      id: true, role: true, note: true, projectIds: true, createdBy: true, expiresAt: true,
      consumedAt: true, consumedBy: true, revokedAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}
