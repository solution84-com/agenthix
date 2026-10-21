import path from 'node:path'
import { resolveHqAssetPath } from '../../server/hqAssets'
import { getHqStorageRoot } from '../../server/hqStoragePaths'

/** A built-in library item's files live in hq's assets; any other's in hq's own storage. */
export function itemDir(assetPath: string, builtIn: boolean): string {
  return builtIn ? resolveHqAssetPath(assetPath) : path.join(getHqStorageRoot(), assetPath)
}
