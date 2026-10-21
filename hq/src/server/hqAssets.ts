/**
 * hq's own bundled assets — templates, library skills, presets, the kernel and
 * platform package sources. Read by hq alone, from its own image, never from a
 * site's disk (spec §6.5).
 *
 * Wasp runs the server from <hq>/.wasp/out/server locally and from
 * /app/.wasp/out/server in the image, so three levels up is hq/assets or
 * /app/assets. HQ_ASSETS_ROOT overrides it for any other layout.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

export function getHqAssetsRoot(): string {
  const configured = process.env.HQ_ASSETS_ROOT
  if (configured) return path.resolve(configured)
  return path.resolve(process.cwd(), '..', '..', '..', 'assets')
}

export function resolveHqAssetPath(assetPath: string): string {
  const root = getHqAssetsRoot()
  const resolved = path.resolve(root, assetPath)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Asset path ${JSON.stringify(assetPath)} leaves hq's assets`)
  }
  return resolved
}

export class MissingAssetsError extends Error {
  constructor(dir: string) {
    const configured = process.env.HQ_ASSETS_ROOT
    super(
      `hq's assets directory ${dir} does not exist — check HQ_ASSETS_ROOT (${configured ? `set to ${configured}` : `unset, so the assets root resolved to ${getHqAssetsRoot()}`})`,
    )
    this.name = 'MissingAssetsError'
  }
}

/**
 * A boot write reads a directory of hq's assets as the whole of a package.
 * A missing directory is a broken deployment, not an empty package, so it is
 * refused rather than written. A present, empty directory is fine.
 */
export async function assertAssetDir(dir: string): Promise<void> {
  try {
    await fs.stat(dir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new MissingAssetsError(dir)
    throw err
  }
}
