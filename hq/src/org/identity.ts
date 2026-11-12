/**
 * The organisation's identity (every screen reviewed spec §3, Organisation):
 * its name and @handle, its picture and cover, its vision and mission, shown as
 * the Organisation page's hero. Everyone in it reads it; its admins change it.
 * The picture and cover are `identityImages.ts`.
 */
import { HttpError, prisma } from 'wasp/server'
import { requireRole } from '../server/identity/requireRole'
import { packageWriteOrHttp } from '../packages/writeErrors'
import { changeOrgPackage, prepareOrgPackage } from '../packages/orgPackageService'
import type { OrgIdentity } from '@agenthix/core'
import { signInShowsChoice } from './publicIdentity'
import { redrawIfFollowsName } from '../pictures/service'

type Ctx = { user?: { id: string } | null }

/** Declared in core's client protocol, since the mobile app reads it too. */
export type { OrgIdentity } from '@agenthix/core'

const HANDLE_RE = /^[a-z0-9][a-z0-9-]{1,38}$/

/** Pure: a handle as stored, lowercase and without the @, or null for none. */
export function normaliseOrgHandle(input: unknown): string | null {
  if (input === null || input === undefined) return null
  if (typeof input !== 'string') throw new Error('A handle must be text')
  const value = input.trim().replace(/^@/, '').toLowerCase()
  if (value === '') return null
  if (!HANDLE_RE.test(value)) throw new Error('A handle is 2 to 39 lowercase letters, digits or hyphens, starting with a letter or digit')
  return value
}

export const getOrgIdentity = async (_args: unknown, context: Ctx): Promise<OrgIdentity> => {
  if (!context.user) throw new HttpError(401)
  const org = await prisma.org.findFirst()
  if (!org) return { id: '', name: 'My Organisation', handle: null, vision: '', mission: '', avatarUrl: null, coverUrl: null, since: null, signInShows: 'cover' }
  return {
    id: org.id, name: org.name, handle: org.handle, vision: org.vision, mission: org.mission,
    avatarUrl: org.avatarUrl, coverUrl: org.coverUrl, since: org.createdAt, signInShows: signInShowsChoice(org.signInShows),
  }
}

/** Changes what is given. As `updateOrg` does, the row and the organisation's package move together. */
export const updateOrgIdentity = async (
  args: { name?: string; handle?: string | null; vision?: string; mission?: string },
  context: Ctx,
): Promise<{ ok: true }> => {
  await requireRole(context, 'ADMIN', 'Changing the organisation')
  const data: { name?: string; handle?: string | null; vision?: string; mission?: string } = {}
  if (args.name !== undefined) {
    const name = typeof args.name === 'string' ? args.name.trim() : ''
    if (!name) throw new HttpError(400, 'The organisation needs a name')
    data.name = name
  }
  if (args.handle !== undefined) {
    try {
      data.handle = normaliseOrgHandle(args.handle)
    } catch (err) {
      throw new HttpError(400, (err as Error).message)
    }
  }
  if (args.vision !== undefined) data.vision = String(args.vision)
  if (args.mission !== undefined) data.mission = String(args.mission)
  const org = await prisma.org.findFirst({ select: { id: true, name: true } })
  if (!org) throw new HttpError(409, 'There is no organisation yet')
  const initialFiles = await prepareOrgPackage()
  await packageWriteOrHttp(() => prisma.$transaction(async (tx) => {
    await tx.org.update({ where: { id: org.id }, data })
    return changeOrgPackage(files => files, context.user!.id, tx, initialFiles ?? undefined)
  }))
  if (data.name !== undefined && data.name !== org.name) await redrawIfFollowsName({ kind: 'org', id: org.id })
  return { ok: true }
}
