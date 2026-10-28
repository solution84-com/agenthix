/**
 * What changed, as the per-file texts the diff draws: from the version in use to another (*Update available*, *Roll
 * back*), and on an organisation's copy from the original at the version it was copied to the original's newest
 * (*News*; shown, never merged, D18).
 */
import { compareSemVer } from '@agenthix/core'
import type { Db } from '../../../packages/packageStore'
import { readContent } from '../../content'
import { LifecycleError } from '../../lifecycle/errors'
import { libraryAsset } from '../../lifecycle/records'
import { copyNews } from '../../lifecycle/ownCopy'
import { diffFiles } from './pageDiff'
import type { AssetDiffView, NewsDiffView } from './pageTypes'

const NOTHING = 'Nothing was changed.'

export async function versionDiff(db: Db, assetId: unknown, versionId: unknown): Promise<AssetDiffView> {
  const asset = await libraryAsset(db, assetId)
  const target = typeof versionId === 'string' ? await db.assetVersion.findFirst({ where: { id: versionId, assetId: asset.id } }) : null
  if (!target) throw new LifecycleError(`hq doesn't hold that version. ${NOTHING}`, 404)
  const from = asset.currentVersion ? await readContent(asset.currentVersion.digest, db) : []
  return { from: asset.currentVersion?.version ?? null, to: target.version, files: diffFiles(from, await readContent(target.digest, db)) }
}

/** The original's change since the copy was made; null when this isn't a copy. */
export async function newsDiff(db: Db, copyId: unknown): Promise<NewsDiffView | null> {
  const news = await copyNews(db, copyId)
  if (!news) return null
  if (!news.newer) return { original: news.original, copiedFrom: news.copiedFrom, inUse: news.inUse, newer: null }
  const [publisher, name] = news.original.split('/')
  const versions = await db.assetVersion.findMany({ where: { asset: { publisher, name } }, select: { version: true, digest: true } })
  const from = versions.find(v => v.version === news.copiedFrom)
  const to = versions.find(v => compareSemVer(v.version, news.newer!.version) === 0)
  if (!to) return { original: news.original, copiedFrom: news.copiedFrom, inUse: news.inUse, newer: null }
  return {
    original: news.original, copiedFrom: news.copiedFrom, inUse: news.inUse,
    newer: { version: news.newer.version, files: diffFiles(from ? await readContent(from.digest, db) : [], await readContent(to.digest, db)) },
  }
}
