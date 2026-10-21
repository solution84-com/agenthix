import { HttpError } from 'wasp/server'
import type { CreateInvite, RevokeInvite } from 'wasp/server/operations'
import { generateInviteToken, hashInviteToken } from './inviteToken'
import { addressWorksOnlyHere, invitationLink } from './hqLinks'

/**
 * `note` is who the invitation is for, shown in the list of invitations;
 * `projectIds` are projects the person joins as a Member on accepting — any
 * the inviting admin can see: an open one, or a private one they are in
 * (every screen reviewed spec §3, People).
 */
type CreateInviteArgs = { role: 'ADMIN' | 'MEMBER'; note?: string; projectIds?: string[] }
/**
 * `link` is built from hq's configured address, never the admin's browser's;
 * `addressWorksOnlyHere` says it opens only on hq's own machine, so the admin is told before sending it.
 */
type CreateInviteResult = {
  id: string
  token: string
  link: string
  addressWorksOnlyHere: boolean
  role: string
  expiresAt: Date | null
  note: string | null
  projectIds: string[]
}

type ProjectDelegate = Parameters<CreateInvite>[1]['entities']['Project']

async function projectsTheAdminCanSee(projects: ProjectDelegate, adminId: string, projectIds: string[]): Promise<string[]> {
  const ids = [...new Set(projectIds)]
  if (ids.length === 0) return []
  const seen = await projects.findMany({
    where: { id: { in: ids }, personalOwnerId: null, OR: [{ accessLevel: 'OPEN' }, { members: { some: { userId: adminId } } }] },
    select: { id: true },
  })
  // A project the admin cannot see answers as one that does not exist.
  if (seen.length !== ids.length) throw new HttpError(400, 'An invitation can only name projects you can see')
  return ids
}

export const createInvite: CreateInvite<CreateInviteArgs, CreateInviteResult> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const callerSettings = await context.entities.UserSettings.findFirst({ where: { userId: context.user.id } })
  if (callerSettings?.role !== 'ADMIN') throw new HttpError(403, 'Admin access required')

  const projectIds = await projectsTheAdminCanSee(context.entities.Project, context.user.id, args.projectIds ?? [])
  const note = args.note?.trim() || null
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  // Returned to the admin here and nowhere else — only the hash is stored.
  const token = generateInviteToken()

  const invite = await context.entities.Invite.create({
    data: {
      tokenHash: hashInviteToken(token),
      role: args.role,
      note,
      projectIds,
      createdBy: context.user.id,
      expiresAt,
    },
  })

  return {
    id: invite.id,
    token,
    link: invitationLink(token),
    addressWorksOnlyHere: addressWorksOnlyHere(),
    role: invite.role,
    expiresAt: invite.expiresAt,
    note: invite.note,
    projectIds: invite.projectIds,
  }
}

type RevokeInviteArgs = { inviteId: string }

export const revokeInvite: RevokeInvite<RevokeInviteArgs, void> = async (args, context) => {
  if (!context.user) throw new HttpError(401)
  const callerSettings = await context.entities.UserSettings.findFirst({ where: { userId: context.user.id } })
  if (callerSettings?.role !== 'ADMIN') throw new HttpError(403, 'Admin access required')

  const invite = await context.entities.Invite.findUnique({ where: { id: args.inviteId } })
  if (!invite || invite.kind !== 'INVITATION') throw new HttpError(404, 'Invite not found')
  if (invite.consumedAt) throw new HttpError(400, 'Cannot revoke a consumed invite')
  if (invite.revokedAt) throw new HttpError(400, 'Invite already revoked')

  await context.entities.Invite.update({
    where: { id: invite.id },
    data: { revokedAt: new Date() },
  })
}
