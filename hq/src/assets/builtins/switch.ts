/**
 * The organisation's switch for each built-in skill (spec part 1 L1a, D6; plan 4.12): on for every agent unless an
 * administrator switches it off. A built-in is never edited, granted or removed here; switching is its only setting,
 * and it is the organisation's (`settings`), so only administrators change it. Hosted in `assets.wasp.ts`; the screen
 * is the Library's.
 */
import { HttpError, prisma } from 'wasp/server'
import { AGENTHIX_PUBLISHER } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { assertMay, PolicyError, type PersonActor } from '../policy'
import { organisationTarget, personActor } from '../policyActors'
import { skillDescription, skillMdOf, skillTitle } from '../skillFile'
import { readContent } from '../content'
import { REPOSITORY_ONLY } from './delivery'

const NOTHING = 'Nothing was changed.'

export type BuiltInSkillRow = {
  assetId: string
  identity: string
  title: string
  description: string
  version: string
  on: boolean
  /** Given only to runs that work in a git repository. */
  repositoryOnly: boolean
}

export class BuiltInSwitchError extends Error {
  constructor(message: string, readonly status: 403 | 404) { super(message) }
}

export async function listBuiltIns(db: Db): Promise<BuiltInSkillRow[]> {
  const rows = await db.asset.findMany({
    where: { kind: 'SKILL', builtIn: true, removedAt: null, publisher: AGENTHIX_PUBLISHER, currentVersionId: { not: null } },
    include: { currentVersion: { select: { version: true, digest: true } } },
    orderBy: { name: 'asc' },
  })
  return Promise.all(rows.map(async r => {
    const md = skillMdOf(await readContent(r.currentVersion!.digest, db))
    return {
      assetId: r.id, identity: `${r.publisher}/${r.name}`, title: skillTitle(md, r.name), description: skillDescription(md),
      version: r.currentVersion!.version, on: !r.switchedOff, repositoryOnly: REPOSITORY_ONLY.has(r.name),
    }
  }))
}

export async function switchBuiltIn(db: Db, actor: PersonActor, input: { assetId: unknown; on: unknown }): Promise<BuiltInSkillRow[]> {
  try {
    assertMay(actor, 'settings', await organisationTarget(db))
  } catch (err) {
    if (err instanceof PolicyError) throw new BuiltInSwitchError(err.message, 403)
    throw err
  }
  const asset = typeof input.assetId === 'string' ? await db.asset.findUnique({ where: { id: input.assetId } }) : null
  if (!asset || !asset.builtIn || asset.removedAt) throw new BuiltInSwitchError(`That isn't one of Agenthix's built-in skills. ${NOTHING}`, 404)
  await db.asset.update({ where: { id: asset.id }, data: { switchedOff: input.on !== true } })
  return listBuiltIns(db)
}

type Ctx = { user?: { id: string } | null }

async function signedIn(context: Ctx): Promise<PersonActor> {
  if (!context.user) throw new HttpError(401)
  return personActor(context.user.id, prisma)
}

export const getBuiltInSkills = async (_args: unknown, context: Ctx): Promise<BuiltInSkillRow[]> => {
  const actor = await signedIn(context)
  if (actor.role === null) throw new HttpError(403, 'The Library is for people in this organisation. Nothing was changed.')
  return listBuiltIns(prisma)
}

export const setBuiltInSkillSwitch = async (args: unknown, context: Ctx): Promise<BuiltInSkillRow[]> => {
  const actor = await signedIn(context)
  const a = args && typeof args === 'object' ? (args as Record<string, unknown>) : {}
  try {
    return await switchBuiltIn(prisma, actor, { assetId: a.assetId, on: a.on })
  } catch (err) {
    if (err instanceof BuiltInSwitchError) throw new HttpError(err.status, err.message)
    throw err
  }
}
