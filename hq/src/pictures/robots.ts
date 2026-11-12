/**
 * The robots on the server (ADR-0187): the bundle scripts/robots/fetch.mjs put in hq's assets, read once. Its manifest
 * gives PictureContext.robots and the files PictureAssets.robot reads. Missing robots never break hq: a missing,
 * unreadable or altered bundle is `null`, and the Robots category is hidden. A file is read only by a name the
 * manifest lists, so no input ever becomes a path.
 */
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getHqAssetsRoot } from '../server/hqAssets'
import type { PictureAssets } from './render'

/** As the robots style holds a name (shared/pictures/styles/robots.ts), which a file name must also satisfy. */
const ROBOT_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SHA256 = /^[0-9a-f]{64}$/

export interface Robots extends PictureAssets {
  /** The manifest's names, in gallery order: what PictureContext.robots holds. */
  readonly names: readonly string[]
}

/** For where the robots are missing: nothing can be read. */
export const NO_ROBOT_FILES: PictureAssets = {
  robot: (name) => Promise.reject(new Error(`The robots are not installed, so ${JSON.stringify(name)} cannot be read`)),
}

interface ManifestEntry {
  name: string
  sha256: string
}

function readManifest(raw: string): ManifestEntry[] {
  const parsed: unknown = JSON.parse(raw)
  const robots = (parsed as { robots?: unknown } | null)?.robots
  if (!Array.isArray(robots) || robots.length === 0) throw new Error('the manifest lists no robots')
  const seen = new Set<string>()
  return robots.map((entry: unknown) => {
    const { name, file, sha256 } = (entry ?? {}) as Record<string, unknown>
    if (typeof name !== 'string' || !ROBOT_NAME.test(name) || seen.has(name)) throw new Error('a robot has no usable name')
    if (file !== `${name}.webp` || typeof sha256 !== 'string' || !SHA256.test(sha256)) {
      throw new Error(`${name} is not listed as ${name}.webp with its SHA-256`)
    }
    seen.add(name)
    return { name, sha256 }
  })
}

/** The bundle in `dir`, every file checked against the manifest; null where it is missing or does not match. */
export async function loadRobots(dir: string): Promise<Robots | null> {
  let raw: string
  try {
    raw = await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    console.warn(`[robots] ${dir}: the manifest cannot be read, so the robots are hidden:`, err)
    return null
  }
  try {
    const entries = readManifest(raw)
    for (const { name, sha256 } of entries) {
      const digest = crypto.createHash('sha256').update(await fs.readFile(path.join(dir, `${name}.webp`))).digest('hex')
      if (digest !== sha256) throw new Error(`${name}.webp does not match the manifest`)
    }
    const names = entries.map((e) => e.name)
    const known = new Set(names)
    return {
      names,
      robot(name) {
        if (!known.has(name)) return Promise.reject(new Error(`${JSON.stringify(name)} is not a robot in the bundle`))
        return fs.readFile(path.join(dir, `${name}.webp`))
      },
    }
  } catch (err) {
    console.warn(`[robots] ${dir}: the bundle is not usable, so the robots are hidden:`, err)
    return null
  }
}

let loaded: Promise<Robots | null> | undefined

/** hq's own robots, from `<assets>/robots`, read on first use and kept for the life of the process. */
export function getRobots(): Promise<Robots | null> {
  loaded ??= loadRobots(path.join(getHqAssetsRoot(), 'robots'))
  return loaded
}
