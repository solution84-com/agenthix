/**
 * An asset's files at one version, for the page's content and each version's *View* (skills spec part 6; adr-0155):
 * the file list with the kind the file frame draws it as, and one file's bytes. Read from hq's records by digest.
 */
import { chooseFileKind, looksLikeText, TEXT_SNIFF_BYTES } from '@agenthix/core'
import type { Db } from '../../../packages/packageStore'
import { readContent } from '../../content'
import { LifecycleError } from '../../lifecycle/errors'
import { libraryAsset } from '../../lifecycle/records'
import { SKILL_FILE } from '../../skillFile'
import type { AssetContentView, AssetFileView } from './pageTypes'

const NOTHING = 'Nothing was changed.'

export async function assetContent(db: Db, assetId: unknown, versionId?: unknown, path?: unknown): Promise<AssetContentView> {
  const asset = await libraryAsset(db, assetId)
  const version = typeof versionId === 'string'
    ? await db.assetVersion.findFirst({ where: { id: versionId, assetId: asset.id } })
    : asset.currentVersion
  if (!version) throw new LifecycleError(`hq doesn't hold that version. ${NOTHING}`, 404)
  const files = await readContent(version.digest, db)
  const views = files.map((f): AssetFileView => {
    const kind = chooseFileKind(f.path, looksLikeText(f.content.subarray(0, TEXT_SNIFF_BYTES)))
    return { path: f.path, size: f.content.length, kind: kind.kind, contentType: kind.contentType, ...(kind.language ? { language: kind.language } : {}) }
  })
  const wanted = typeof path === 'string' ? path : SKILL_FILE
  const opened = files.find(f => f.path === wanted) ?? (typeof path === 'string' ? undefined : files[0])
  if (typeof path === 'string' && !opened) throw new LifecycleError(`That file isn't in this version. ${NOTHING}`, 404)
  return { version: version.version, files: views, opened: opened ? { path: opened.path, base64: opened.content.toString('base64') } : null }
}
