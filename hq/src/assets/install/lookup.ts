import type { AssetKind } from '@agenthix/core'
import type { Db } from '../../packages/packageStore'
import { kindRow } from '../kinds'
import type { ExistingAsset } from './plan'

const VERSION = { version: true, digest: true, signerIdentity: true } as const

/** An identity as hq holds it, for the plan. */
export async function findExisting(db: Db, kind: AssetKind, publisher: string, name: string): Promise<ExistingAsset | null> {
  const row = await db.asset.findUnique({
    where: { kind_publisher_name: { kind: kindRow(kind), publisher, name } },
    select: { id: true, builtIn: true, removedAt: true, currentVersion: { select: VERSION }, versions: { select: VERSION } },
  })
  if (!row) return null
  return { id: row.id, builtIn: row.builtIn, removed: row.removedAt !== null, current: row.currentVersion, versions: row.versions }
}
