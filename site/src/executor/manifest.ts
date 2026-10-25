/**
 * What a tree holds, by content: each path's kind, and a file's SHA-256 and mode or a link's target. Taken of the
 * snapshot when it is made and again when the run ends, so what a run changed is found by content, never by times
 * and sizes a program can set back (workflows spec part 2, *The changed-file scan*). Walked with `safeTree.ts`, so no
 * link a step left in the snapshot is ever followed.
 */
import { createHash } from 'node:crypto'
import type { FileHandle } from '../agents/runtime/containedFile'
import fs from 'node:fs/promises'
import { closeDir, inDir as inDirPath, lstatIn, namesIn, openChildDir, openFileIn, openRoot, type Dir } from './safeTree'

export type ManifestEntry =
  | { kind: 'file'; sha256: string; mode: number }
  | { kind: 'link'; target: string }
  | { kind: 'dir'; mode: number }

/** Paths relative to the tree's root, parts joined with `/`. The root itself is not in it. */
export type Manifest = Map<string, ManifestEntry>

export async function hashHandle(handle: FileHandle): Promise<string> {
  const hash = createHash('sha256')
  const buf = Buffer.allocUnsafe(1 << 20)
  let position = 0
  for (;;) {
    const { bytesRead } = await handle.read(buf, 0, buf.length, position)
    if (bytesRead === 0) break
    hash.update(buf.subarray(0, bytesRead))
    position += bytesRead
  }
  return hash.digest('hex')
}

/** Copies all of `from` into `to`, both open descriptors, from the start. */
export async function copyHandle(from: FileHandle, to: FileHandle): Promise<void> {
  const buf = Buffer.allocUnsafe(1 << 20)
  let position = 0
  for (;;) {
    const { bytesRead } = await from.read(buf, 0, buf.length, position)
    if (bytesRead === 0) break
    let written = 0
    while (written < bytesRead) {
      const { bytesWritten } = await to.write(buf, written, bytesRead - written, position + written)
      written += bytesWritten
    }
    position += bytesRead
  }
}

/** A file's mode as the manifest keeps it: its permission bits, never set-user-id, set-group-id or sticky. */
export function plainMode(mode: number | bigint): number {
  return Number(mode) & 0o777
}

export async function buildManifest(root: string): Promise<Manifest> {
  const manifest: Manifest = new Map()
  const top = await openRoot(root)
  try {
    await walk(top, manifest)
  } finally {
    await closeDir(top)
  }
  return manifest
}

async function walk(dir: Dir, manifest: Manifest): Promise<void> {
  for (const name of await namesIn(dir)) {
    const rel = dir.rel ? `${dir.rel}/${name}` : name
    const entry = await lstatIn(dir, name)
    if (!entry) continue
    if (entry.isSymbolicLink()) {
      manifest.set(rel, { kind: 'link', target: await fs.readlink(inDirPath(dir, name)) })
    } else if (entry.isDirectory()) {
      const child = await openChildDir(dir, name)
      if (!child) continue
      try {
        manifest.set(rel, { kind: 'dir', mode: plainMode(entry.mode) })
        await walk(child, manifest)
      } finally {
        await closeDir(child)
      }
    } else if (entry.isFile()) {
      const { handle, stat } = await openFileIn(dir, name, { allowHardLinks: true })
      try {
        manifest.set(rel, { kind: 'file', sha256: await hashHandle(handle), mode: plainMode(stat.mode) })
      } finally {
        await handle.close().catch(() => {})
      }
    }
    // Sockets, pipes and devices are neither copied nor written back.
  }
}

export function sameEntry(a: ManifestEntry | undefined, b: ManifestEntry | undefined): boolean {
  if (!a || !b) return a === b
  if (a.kind !== b.kind) return false
  if (a.kind === 'file' && b.kind === 'file') return a.sha256 === b.sha256 && a.mode === b.mode
  if (a.kind === 'link' && b.kind === 'link') return a.target === b.target
  return true
}
