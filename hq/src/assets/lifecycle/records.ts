/**
 * What every lifecycle operation reads and writes the same way: the Library asset it acts on, the policy's target for
 * the organisation's Library, and the pin's move, which writes its history in the same transaction (V1, V2, D30).
 */
import { formatAssetIdentity } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { assertMay, type Actor, type AssetAction, type PolicyTarget } from '../policy'
import { LifecycleError } from './errors'

const NOTHING = 'Nothing was changed.'

export async function libraryTarget(db: Db): Promise<PolicyTarget> {
  const org = await db.org.findFirst({ select: { outsideInstallers: true } })
  return { level: 'organisation', outsideInstallers: org?.outsideInstallers ?? 'ADMINS' }
}

export async function assertLibrary(actor: Actor, action: AssetAction, db: Db): Promise<void> {
  assertMay(actor, action, await libraryTarget(db))
}

const WITH_CURRENT = { currentVersion: true } as const

/** A skill in the Library, not removed. Only skills have a lifecycle in this phase; templates follow (phase 5). */
export async function librarySkill(db: Db, assetId: unknown) {
  const asset = typeof assetId === 'string' ? await db.asset.findUnique({ where: { id: assetId }, include: WITH_CURRENT }) : null
  if (!asset || asset.removedAt) throw new LifecycleError(`That isn't in the Library. ${NOTHING}`, 404)
  if (asset.kind !== 'SKILL') throw new LifecycleError(`Only skills can be changed this way yet. ${NOTHING}`)
  return asset
}

export type LibrarySkill = Awaited<ReturnType<typeof librarySkill>>

/**
 * Any Library asset, not removed: a skill or a template. Its versions, updates and roll backs work the same for every
 * kind (adr-0157); drafts, copies and who has it stay with skills (`librarySkill`).
 */
export async function libraryAsset(db: Db, assetId: unknown) {
  const asset = typeof assetId === 'string' ? await db.asset.findUnique({ where: { id: assetId }, include: WITH_CURRENT }) : null
  if (!asset || asset.removedAt) throw new LifecycleError(`That isn't in the Library. ${NOTHING}`, 404)
  return asset
}

export const identityOf = (asset: { publisher: string; name: string }) => formatAssetIdentity(asset)

/** Who is recorded as doing it: the person, and the agent that asked for it when a person approved its request (D31). */
export type By = { byId: string; requestedByAgentId?: string | null }

export function byOf(actor: Actor, requestedByAgentId?: string | null): By {
  if (actor.kind !== 'person') throw new LifecycleError(`Only a person can do this; an agent asks, and a person approves. ${NOTHING}`, 403)
  return { byId: actor.userId, requestedByAgentId: requestedByAgentId ?? null }
}

/**
 * Moves the pin from the version it was read at to another, and records who, when and why. Refused when the pin moved
 * in between, so two people acting at once never both think they chose the version in use.
 */
export async function movePin(
  tx: Db,
  move: { assetId: string; fromVersionId: string | null; toVersionId: string; reason: string } & By,
): Promise<void> {
  const { count } = await tx.asset.updateMany({
    where: { id: move.assetId, currentVersionId: move.fromVersionId },
    data: { currentVersionId: move.toVersionId },
  })
  if (count === 0) throw new LifecycleError(`Someone changed the version in use at the same moment. Look at it again. ${NOTHING}`, 409)
  await tx.assetPinChange.create({
    data: {
      assetId: move.assetId, fromVersionId: move.fromVersionId, toVersionId: move.toVersionId,
      byId: move.byId, requestedByAgentId: move.requestedByAgentId ?? null, reason: move.reason,
    },
  })
}
