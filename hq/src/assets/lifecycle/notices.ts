/**
 * *Skip this version* and dismissing news (board U5, UQ10; spec part 2, D18). Skipping stops an update the
 * organisation decided against from being offered, until a version after it is held. Dismissing news on the
 * organisation's own copy hides the original's newer version, until a version after it is out. Both are remembered
 * per asset, both are undone by a newer version, and neither changes what any agent uses.
 */
import type { PrismaClient } from '@prisma/client'
import type { Actor } from '../policy'
import { LifecycleError } from './errors'
import { assertLibrary, byOf, identityOf, libraryAsset, librarySkill } from './records'
import { copyNews } from './ownCopy'
import { offeredUpdate } from './offers'

const NOTHING = 'Nothing was changed.'

/** *Skip <version>*: hides that update, and any older one, until a later version is held. */
export async function skipUpdate(db: PrismaClient, actor: Actor, input: { assetId: unknown; version: unknown }): Promise<{ identity: string; skipped: string }> {
  await assertLibrary(actor, 'update', db)
  byOf(actor)
  const asset = await libraryAsset(db, input.assetId)
  const versions = await db.assetVersion.findMany({ where: { assetId: asset.id }, select: { version: true, withdrawn: true } })
  const offered = asset.currentVersion ? offeredUpdate(versions, asset.currentVersion.version, asset.skippedVersion) : null
  if (!offered || offered.version !== input.version) {
    throw new LifecycleError(`${identityOf(asset)} isn't offering that update now. Look at it again. ${NOTHING}`, 409)
  }
  await db.asset.update({ where: { id: asset.id }, data: { skippedVersion: offered.version } })
  return { identity: identityOf(asset), skipped: offered.version }
}

/** *Dismiss* on the news of the organisation's copy: hides the original's version named, until a later one is out. */
export async function dismissNews(db: PrismaClient, actor: Actor, input: { assetId: unknown; version: unknown }): Promise<{ identity: string; seen: string }> {
  await assertLibrary(actor, 'update', db)
  byOf(actor)
  const copy = await librarySkill(db, input.assetId)
  const news = await copyNews(db, copy.id)
  if (!news?.newer || news.newer.version !== input.version) {
    throw new LifecycleError(`There is no news of that version on ${identityOf(copy)} now. Look at it again. ${NOTHING}`, 409)
  }
  await db.asset.update({ where: { id: copy.id }, data: { newsSeenVersion: news.newer.version } })
  return { identity: identityOf(copy), seen: news.newer.version }
}
