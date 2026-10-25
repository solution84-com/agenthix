/**
 * The changed-file scan (workflows spec part 2, *The changed-file scan*): before anything a run changed reaches the
 * agent's workspace, every file and link it created or changed in the snapshot, and everything in `/run/out`, is
 * checked for every form of every secret of the place — by content, and git's objects decompressed. The names of the
 * paths are checked too, since a folder or file named with a value would be written back as well.
 *
 * Nothing is followed: files are opened through `safeTree.ts`, and a link's target is read as text and checked. A
 * file the scan can't read whole counts as a leak, so the run fails closed. A leak's path is itself masked, so the
 * report never carries a value.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { WorkflowLeak, WorkflowMaskingMaterial } from '@agenthix/core'
import { hashHandle } from '../manifest'
import { closeDir, inDir, lstatIn, namesIn, openChildDir, openDirPath, openFileIn, openRoot, type Dir } from '../safeTree'
import { UNSCANNED_SECRET, type ScanRunChangesInput, type ScanRunChangesResult } from '../seams'
import { GIT_OBJECTS_MAX_BYTES, mayHoldGitObjects, packStart, readLooseObject, readPackObjects } from './gitObjects'
import { createFormMasker } from './masker'
import { FormMatcher } from './matcher'

const READ_CHUNK = 64 * 1024
/** Where `/run/out`'s files are said to be in a leak. */
const OUT_PREFIX = '/run/out'

type Found = { names: Set<string>; unscanned: boolean }

export async function scanChanges(input: ScanRunChangesInput): Promise<ScanRunChangesResult> {
  try {
    new FormMatcher(input.material)
  } catch {
    const leaks = input.changes.filter(c => c.kind === 'file' || c.kind === 'link').map(c => ({ path: c.path, secretName: UNSCANNED_SECRET }))
    return { leaks: leaks.length ? leaks : [{ path: OUT_PREFIX, secretName: UNSCANNED_SECRET }] }
  }
  const scan = new Scan(input.material)
  const snapshot = await openRoot(input.snapshotDir)
  try {
    for (const change of input.changes) {
      if (change.kind === 'deleted') continue
      await scan.name(change.path)
      if (change.kind === 'dir') continue
      const slash = change.path.lastIndexOf('/')
      const parent = slash < 0 ? snapshot : await openDirPath(snapshot, change.path.slice(0, slash)).catch(() => null)
      if (!parent) { await scan.add(change.path, { names: new Set(), unscanned: true }); continue }
      try {
        await scan.entry(parent, change.path.slice(slash + 1), change.path)
      } finally {
        await closeDir(parent, snapshot)
      }
    }
  } finally {
    await closeDir(snapshot)
  }
  const out = await openRoot(input.outDir).catch(() => null)
  if (out) {
    try {
      await scan.tree(out, OUT_PREFIX)
    } finally {
      await closeDir(out)
    }
  }
  return { leaks: scan.leaks }
}

class Scan {
  readonly leaks: WorkflowLeak[] = []
  /** What each content already scanned held, by SHA-256: a tree of copies is read once. */
  private readonly byContent = new Map<string, Found>()

  constructor(private readonly material: WorkflowMaskingMaterial) {}

  async add(rawPath: string, found: Found): Promise<void> {
    if (found.names.size === 0 && !found.unscanned) return
    const shown = await this.masked(rawPath)
    for (const name of [...found.names].sort()) this.leaks.push({ path: shown, secretName: name })
    if (found.unscanned) this.leaks.push({ path: shown, secretName: UNSCANNED_SECRET })
  }

  async name(relPath: string, shown = relPath): Promise<void> {
    await this.add(shown, { names: await this.bytes(Buffer.from(relPath)), unscanned: false })
  }

  /** One entry of `dir`, never followed: a file by content, a link by its target. */
  async entry(dir: Dir, name: string, shown: string): Promise<void> {
    try {
      const st = await lstatIn(dir, name)
      if (!st) throw new Error('gone')
      if (st.isSymbolicLink()) {
        await this.add(shown, { names: await this.bytes(Buffer.from(await fs.readlink(inDir(dir, name)))), unscanned: false })
      } else if (st.isFile()) {
        await this.add(shown, await this.file(dir, name))
      } else if (!st.isDirectory()) {
        return
      } else {
        throw new Error('a folder where a file was')
      }
    } catch {
      await this.add(shown, { names: new Set(), unscanned: true })
    }
  }

  /** Everything under `dir`, names included. */
  async tree(dir: Dir, shownRoot: string): Promise<void> {
    for (const name of await namesIn(dir)) {
      const shown = `${shownRoot}/${dir.rel ? `${dir.rel}/` : ''}${name}`
      await this.name(path.posix.join(dir.rel, name), shown)
      const st = await lstatIn(dir, name)
      if (st?.isDirectory()) {
        const child = await openChildDir(dir, name).catch(() => null)
        if (!child) { await this.add(shown, { names: new Set(), unscanned: true }); continue }
        try {
          await this.tree(child, shownRoot)
        } finally {
          await closeDir(child)
        }
      } else {
        await this.entry(dir, name, shown)
      }
    }
  }

  private async file(dir: Dir, name: string): Promise<Found> {
    const { handle } = await openFileIn(dir, name, { allowHardLinks: true })
    try {
      const sha = await hashHandle(handle)
      const seen = this.byContent.get(sha)
      if (seen) return seen
      const found = await this.content(handle)
      this.byContent.set(sha, found)
      return found
    } finally {
      await handle.close().catch(() => {})
    }
  }

  private async content(handle: Awaited<ReturnType<typeof fs.open>>): Promise<Found> {
    const masker = createFormMasker(this.material)
    const buf = Buffer.allocUnsafe(READ_CHUNK)
    const head = Buffer.alloc(32)
    let headLength = 0
    let position = 0
    for (;;) {
      const { bytesRead } = await handle.read(buf, 0, buf.length, position)
      if (bytesRead === 0) break
      if (headLength < head.length) headLength += buf.copy(head, headLength, 0, Math.min(bytesRead, head.length - headLength))
      await masker.push(buf.subarray(0, bytesRead))
      position += bytesRead
    }
    await masker.end()
    const names = new Set(masker.printed())
    if (!mayHoldGitObjects(head.subarray(0, headLength))) return { names, unscanned: false }
    if (position > GIT_OBJECTS_MAX_BYTES) return { names, unscanned: true }
    const whole = Buffer.alloc(position)
    await handle.read(whole, 0, position, 0)
    try {
      for (const object of gitObjectsIn(whole)) for (const n of await this.bytes(object)) names.add(n)
      return { names, unscanned: false }
    } catch {
      return { names, unscanned: true }
    }
  }

  /** The secrets found in `bytes`. */
  async bytes(bytes: Uint8Array): Promise<Set<string>> {
    const masker = createFormMasker(this.material)
    for (let at = 0; at < bytes.length; at += READ_CHUNK) await masker.push(bytes.subarray(at, at + READ_CHUNK))
    await masker.end()
    return new Set(masker.printed())
  }

  private async masked(raw: string): Promise<string> {
    const masker = createFormMasker(this.material)
    return Buffer.concat([await masker.push(Buffer.from(raw)), await masker.end()]).toString('utf8')
  }
}

/** The git objects a file holds, decompressed: none when it is not git's; throws when it is and can't be read. */
function gitObjectsIn(file: Buffer): Buffer[] {
  const start = packStart(file)
  if (start !== null) return readPackObjects(file, start)
  const loose = readLooseObject(file)
  return loose ? [loose] : []
}
