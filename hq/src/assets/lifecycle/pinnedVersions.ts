/**
 * Pinned versions (spec part 2 *Versions* V1–V3, V6): an asset's versions in SemVer order with the one in use, the
 * updates offered and the withdrawn ones marked; what changed between the version in use and another; and moving the
 * pin, forward by an update or back by a roll back, to any version hq holds. Each move is recorded.
 */
import type { PrismaClient } from '@prisma/client'
import { compareSemVer } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { readContent } from '../content'
import type { Actor } from '../policy'
import { LifecycleError } from './errors'
import { assertLibrary, byOf, identityOf, librarySkill, movePin } from './records'
import { bySemVerDescending, fileChanges, pinMoveRefusal, type FileChanges, type PinMove } from './versions'
import { loadWithdrawnList, withdrawnReason, withdrawnRefusal } from './withdrawn'

const NOTHING = 'Nothing was changed.'
const REASON_MAX = 1000

export type VersionRow = {
  id: string
  version: string
  inUse: boolean
  /** Newer than the one in use: an update offered. */
  newer: boolean
  withdrawn: string | null
  source: string
  note: string | null
  byId: string | null
  requestedByAgentId: string | null
  createdAt: Date
}

export type PinHistoryRow = { fromVersion: string | null; toVersion: string; byId: string | null; requestedByAgentId: string | null; reason: string | null; at: Date }

export type AssetVersions = { identity: string; inUse: string | null; versions: VersionRow[]; history: PinHistoryRow[] }

export async function listVersions(db: Db, assetId: unknown): Promise<AssetVersions> {
  const asset = await librarySkill(db, assetId)
  const [versions, changes, withdrawn] = await Promise.all([
    db.assetVersion.findMany({ where: { assetId: asset.id } }),
    db.assetPinChange.findMany({
      where: { assetId: asset.id }, orderBy: { at: 'desc' },
      include: { fromVersion: { select: { version: true } }, toVersion: { select: { version: true } } },
    }),
    loadWithdrawnList(),
  ])
  const inUse = asset.currentVersion?.version ?? null
  const rows = versions
    .sort((a, b) => bySemVerDescending(a.version, b.version))
    .map(v => ({
      id: v.id, version: v.version, inUse: v.id === asset.currentVersionId,
      newer: inUse !== null && compareSemVer(v.version, inUse) > 0,
      withdrawn: withdrawnReason(withdrawn, { publisher: asset.publisher, name: asset.name, ...v }),
      source: v.source, note: v.note, byId: v.byId, requestedByAgentId: v.requestedByAgentId, createdAt: v.createdAt,
    }))
  const history = changes.map(c => ({
    fromVersion: c.fromVersion?.version ?? null, toVersion: c.toVersion.version, byId: c.byId,
    requestedByAgentId: c.requestedByAgentId, reason: c.reason, at: c.at,
  }))
  return { identity: identityOf(asset), inUse, versions: rows, history }
}

async function heldVersion(db: Db, assetId: string, versionId: unknown) {
  const version = typeof versionId === 'string' ? await db.assetVersion.findUnique({ where: { id: versionId } }) : null
  if (!version || version.assetId !== assetId) throw new LifecycleError(`hq doesn't hold that version of this skill. ${NOTHING}`, 404)
  return version
}

/** *Update available* and *Roll back* show what changed: every file added, changed or removed, from the version in use. */
export async function versionChanges(db: Db, assetId: unknown, versionId: unknown): Promise<{ from: string | null; to: string; changes: FileChanges }> {
  const asset = await librarySkill(db, assetId)
  const target = await heldVersion(db, asset.id, versionId)
  const from = asset.currentVersion ? await readContent(asset.currentVersion.digest, db) : []
  return { from: asset.currentVersion?.version ?? null, to: target.version, changes: fileChanges(from, await readContent(target.digest, db)) }
}

export type MoveInput = {
  assetId: unknown
  versionId: unknown
  reason?: unknown
  /** The warning on a withdrawn version, accepted. */
  withdrawnAccepted?: unknown
  requestedByAgentId?: string | null
}

/** Accepts an update (`update`), or rolls back (`rollBack`) to an earlier version hq holds. */
export async function moveToVersion(db: PrismaClient, actor: Actor, move: PinMove, input: MoveInput): Promise<{ identity: string; version: string }> {
  await assertLibrary(actor, move, db)
  const by = byOf(actor, input.requestedByAgentId)
  const asset = await librarySkill(db, input.assetId)
  const current = asset.currentVersion
  if (!current) throw new LifecycleError(`${identityOf(asset)} has no published version yet. ${NOTHING}`, 409)
  const target = await heldVersion(db, asset.id, input.versionId)
  const refusal = pinMoveRefusal(move, current.version, target.version)
  if (refusal) throw new LifecycleError(refusal, 409)
  const why = withdrawnReason(await loadWithdrawnList(), { publisher: asset.publisher, name: asset.name, ...target })
  const warning = withdrawnRefusal(identityOf(asset), target.version, why, input.withdrawnAccepted === true)
  if (warning) throw new LifecycleError(warning, 409)
  const given = typeof input.reason === 'string' ? input.reason.trim().slice(0, REASON_MAX) : ''
  const reason = given || (move === 'update' ? 'Updated' : 'Rolled back')
  await db.$transaction(tx => movePin(tx, { assetId: asset.id, fromVersionId: current.id, toVersionId: target.id, reason, ...by }))
  return { identity: identityOf(asset), version: target.version }
}
