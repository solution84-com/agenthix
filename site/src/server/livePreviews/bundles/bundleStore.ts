/**
 * Where this site keeps Git bundles (live preview spec section 5, *On another site*): in its own data folder, one
 * folder per bundle, never in any storage an agent or an app binds. A bundle made here (`bundle.make`) and one that
 * arrived (`bundle.write`) live the same way; each goes when hq drops it, or after `BUNDLE_KEEP_MS`.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { BUNDLE_KEEP_MS, isCopyId } from '@agenthix/core'
import { getSiteRoot } from '../../../agents/agentDiskPaths'

export const bundlesRoot = (): string => path.join(getSiteRoot(), 'live-preview-bundles')

export function bundleDir(bundleId: string): string {
  if (!isCopyId(bundleId)) throw new Error(`Not a bundle id: ${JSON.stringify(bundleId)}`)
  return path.join(bundlesRoot(), bundleId)
}

export const bundleFile = (bundleId: string): string => path.join(bundleDir(bundleId), 'bundle')

/** A fresh, empty folder for one bundle; one already there is emptied first. */
export async function freshBundleDir(bundleId: string): Promise<string> {
  const dir = bundleDir(bundleId)
  await fs.rm(dir, { recursive: true, force: true })
  await fs.mkdir(dir, { recursive: true, mode: 0o750 })
  return dir
}

/** The bundle's size, when it is here as a plain file (never a link); null otherwise. */
export async function bundleSize(bundleId: string): Promise<number | null> {
  const st = await fs.lstat(bundleFile(bundleId)).catch(() => null)
  return st?.isFile() ? st.size : null
}

export async function hashFile(file: string): Promise<{ sha256: string; size: number }> {
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk as Buffer)
    size += (chunk as Buffer).length
  }
  return { sha256: hash.digest('hex'), size }
}

export async function dropBundle(bundleId: string): Promise<boolean> {
  const dir = bundleDir(bundleId)
  const there = await fs.lstat(dir).then(() => true, () => false)
  await fs.rm(dir, { recursive: true, force: true })
  return there
}

/** A name for a file being written, so a broken transfer never leaves a `bundle` behind. */
export const incomingFile = (bundleId: string): string => path.join(bundleDir(bundleId), `incoming-${randomUUID()}`)

/** Drops every bundle older than `BUNDLE_KEEP_MS`; returns how many. */
export async function sweepBundles(now = Date.now()): Promise<number> {
  const entries = await fs.readdir(bundlesRoot()).catch(() => [] as string[])
  let dropped = 0
  for (const e of entries) {
    const st = await fs.lstat(path.join(bundlesRoot(), e)).catch(() => null)
    if (!st || now - st.mtimeMs < BUNDLE_KEEP_MS) continue
    await fs.rm(path.join(bundlesRoot(), e), { recursive: true, force: true })
    dropped++
  }
  return dropped
}
