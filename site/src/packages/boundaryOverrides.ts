/**
 * A boundary's own adjustments, kept on the boundary's disk (ADR-0072): for one
 * agent, `.agents/agents/<agentId>/instructions.md` and `…/skills/<slug>/`;
 * for every agent working in the boundary, `.agents/skills/<slug>/` — all in
 * the files home of the project or person the run acts in. Per-agent files are
 * keyed on the agent's id, so a rename moves nothing.
 *
 * Everything under here sits on disk the agent itself (or anyone with access to
 * the boundary) can write, so every read stays real-path-confined to the
 * boundary's files home and is rechecked at the moment it happens — a link
 * resolved away when the run launched and swapped back in before the actual
 * read (launch and a read can be seconds apart) must still be refused, not
 * merely one present at that first check.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { PACKAGE_KEY_PATTERN } from '@agenthix/core'
import { getFilesDir, ownerDir, type LocationRef } from '../server/storage/paths'

export const OVERRIDES_DIR = '.agents/agents'
/** Skills every agent working in the boundary receives, staged as `shared-<slug>`. */
export const SHARED_SKILLS_DIR = '.agents/skills'

/**
 * The boundary's own override directory and the files home every read under it
 * must stay inside — both already real-path-resolved once, at `resolve` time
 * (the directory can be trusted only past every symlink, including one
 * standing in for `skills/` itself further down the tree — see
 * skillStaging.ts's own recheck of that).
 */
export type BoundaryOverride = { dir: string; filesHome: string }

export function boundaryOverridePath(loc: Pick<LocationRef, 'ownerType' | 'ownerId'>, agentId: string): { filesHome: string; dir: string } {
  // An agent id is its package's key, so it has a package key's shape.
  if (!PACKAGE_KEY_PATTERN.test(agentId)) throw new Error(`Unsafe agent id ${JSON.stringify(agentId)}`)
  const filesHome = getFilesDir(loc.ownerType, loc.ownerId)
  return { filesHome, dir: path.join(filesHome, ...OVERRIDES_DIR.split('/'), agentId) }
}

export async function realpathOrNull(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p)
  } catch {
    return null
  }
}

/** True when `real` (already real-path-resolved) is `home` itself or strictly inside it. */
export function isInsideHome(home: string, real: string): boolean {
  return real === home || real.startsWith(home + path.sep)
}

/**
 * The files home's real path, or null when `files/` is not a real directory
 * where the layout puts it. A run can replace `files/` with a link, and
 * resolving through it would make the link's target the boundary.
 */
async function realFilesHome(loc: Pick<LocationRef, 'ownerType' | 'ownerId'>, filesHome: string): Promise<string | null> {
  const [realHome, realOwner] = await Promise.all([realpathOrNull(filesHome), realpathOrNull(ownerDir(loc.ownerType, loc.ownerId))])
  if (!realHome || !realOwner || realHome !== path.join(realOwner, path.basename(filesHome))) return null
  return realHome
}

const PROC_FD_SUPPORTED = os.platform() === 'linux'

/**
 * Resolves what an already-open file descriptor refers to RIGHT NOW, via
 * `/proc/self/fd` — race-free for "what did we actually open," because the
 * fd is pinned to a specific inode the instant `open()` returned it, unlike a
 * path-string `realpath` done beforehand, which a symlink swapped into any
 * PARENT directory component afterward can still get past. Linux only:
 * there is no equivalent magic directory on macOS (the dev
 * platform) or other BSDs. Returns null there, and the caller's own pre-open
 * path check remains the only defense against that parent-directory race.
 * On Linux a failed `readlink` rejects: the check exists there, so a caller
 * refuses the read rather than skip it.
 */
export async function realpathOfFd(fd: number): Promise<string | null> {
  if (!PROC_FD_SUPPORTED) return null
  return fs.readlink(`/proc/self/fd/${fd}`)
}

export type NoFollowReadReason = 'missing' | 'link' | 'not-regular' | 'too-large' | 'unreadable' | 'outside-sandbox'
export type NoFollowRead = { ok: true; buf: Buffer } | { ok: false; reason: NoFollowReadReason }

/**
 * Reads a file's bytes only when its final path component is not itself a
 * symlink (`O_NOFOLLOW`) and — where a `sandboxHome` is given — the open
 * descriptor itself resolves inside it (see `realpathOfFd`). The open, the
 * link check and the sandbox recheck are effectively one atomic sequence on
 * the SAME descriptor, so a link swapped in after an earlier stat, or a
 * parent directory swapped after an earlier path-based check, cannot be
 * raced past the way a separate `lstat`/`realpath`-then-`readFile` could.
 *
 * `O_NONBLOCK` is set unconditionally: without it, opening a FIFO for
 * read-only access blocks until a writer connects — forever, if none ever
 * does — which would hold the thread open() runs on hostage. It has no
 * effect on a regular file. Once open, `fstat` confirms the file is a
 * regular file before anything is read — a FIFO opened this way is caught
 * here (`not-regular`) rather than by ever blocking on it.
 *
 * A sandboxed read also refuses a regular file with more than one hard link,
 * reported as `link` — see the check below for why.
 *
 * `maxBytes`, when given, refuses (without reading a single byte) a file
 * whose size — from the same `fstat` — exceeds it. At most that `fstat` size
 * is ever read, so a file growing while it is read cannot overshoot the check.
 *
 * Never throws: every reason above, and any other error, resolves to
 * `{ ok: false, reason }` rather than a rejection, so a hostile or damaged
 * file never aborts the run it's staged for.
 */
export async function readFileNoFollow(
  file: string,
  opts: { maxBytes?: number; sandboxHome?: string } = {},
): Promise<NoFollowRead> {
  let handle
  try {
    handle = await fs.open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ENOENT') return { ok: false, reason: 'missing' }
    if (code === 'ELOOP') return { ok: false, reason: 'link' }
    return { ok: false, reason: 'unreadable' }
  }
  try {
    if (opts.sandboxHome) {
      let real: string | null
      try {
        real = await realpathOfFd(handle.fd)
      } catch {
        return { ok: false, reason: 'outside-sandbox' }
      }
      // null means /proc is unavailable (non-Linux); there is nothing more
      // race-free to check on this platform (see realpathOfFd's doc comment).
      if (real !== null && !isInsideHome(opts.sandboxHome, real)) return { ok: false, reason: 'outside-sandbox' }
    }
    const stat = await handle.stat()
    if (!stat.isFile()) return { ok: false, reason: 'not-regular' }
    // A hard link carries no marker `O_NOFOLLOW` could refuse — it is an
    // ordinary regular file whose path is inside the sandbox — but its link
    // count says the same inode is reachable from somewhere else, which may be
    // outside the files home. Only a sandboxed read is refused for it: a package
    // cache is site-owned and may share inodes on purpose.
    if (opts.sandboxHome && stat.nlink > 1) return { ok: false, reason: 'link' }
    if (opts.maxBytes !== undefined && stat.size > opts.maxBytes) return { ok: false, reason: 'too-large' }
    const buf = Buffer.alloc(stat.size)
    let filled = 0
    while (filled < buf.length) {
      const { bytesRead } = await handle.read(buf, filled, buf.length - filled, filled)
      if (bytesRead === 0) break
      filled += bytesRead
    }
    return { ok: true, buf: filled === buf.length ? buf : buf.subarray(0, filled) }
  } catch {
    return { ok: false, reason: 'unreadable' }
  } finally {
    await handle.close().catch(() => {})
  }
}

export async function readRegularFile(file: string): Promise<string | null> {
  const result = await readFileNoFollow(file)
  return result.ok ? result.buf.toString('utf-8') : null
}

/**
 * The real override directory and the real files home every later read is
 * confined to, or null when there is none or the override directory resolves outside the files home — a
 * link anywhere in `.agents` or `.agents/agents` (or the whole thing
 * replaced by one) is caught here because `fs.realpath` follows and resolves
 * every component of the chain, not just the final one.
 *
 * Both real paths are handed back (not a boolean) because the boundary is
 * writable disk: every later read under it must recheck against this same
 * real files home at the moment it happens, never trust this one-time
 * resolution — see readBoundaryFile and skillStaging.ts's own per-read recheck
 * of the skills tree.
 */
export async function resolveBoundaryOverrideDir(
  loc: Pick<LocationRef, 'ownerType' | 'ownerId'>,
  agentId: string,
): Promise<BoundaryOverride | null> {
  const { filesHome, dir } = boundaryOverridePath(loc, agentId)
  const [realHome, realDir] = await Promise.all([realFilesHome(loc, filesHome), realpathOrNull(dir)])
  if (!realHome || !realDir || !isInsideHome(realHome, realDir)) return null
  return { dir: realDir, filesHome: realHome }
}

/**
 * Reads a file under a boundary override, rechecking containment at the
 * moment of the read (a TOCTOU concern) rather than trusting
 * `resolveBoundaryOverrideDir`'s earlier resolution — launch and this read
 * (after container prep) can be seconds apart, long enough for the boundary's
 * own disk, writable by the agent itself, to change under it.
 */
export async function readBoundaryFile(override: BoundaryOverride, relPath: string): Promise<string | null> {
  const file = path.join(override.dir, relPath)
  const realParent = await realpathOrNull(path.dirname(file))
  if (!realParent || !isInsideHome(override.filesHome, realParent)) return null
  const result = await readFileNoFollow(file, { sandboxHome: override.filesHome })
  return result.ok ? result.buf.toString('utf-8') : null
}

/**
 * The boundary's shared skills directory — skills every agent working there
 * receives — and the real files home every read under it is confined to, or
 * null for a directory that is absent or
 * resolves outside the files home. Every read under it rechecks containment
 * (skillStaging.ts), as for a per-agent override.
 */
export async function resolveBoundarySharedSkillsDir(
  loc: Pick<LocationRef, 'ownerType' | 'ownerId'>,
): Promise<BoundaryOverride | null> {
  const filesHome = getFilesDir(loc.ownerType, loc.ownerId)
  const dir = path.join(filesHome, ...SHARED_SKILLS_DIR.split('/'))
  const [realHome, realDir] = await Promise.all([realFilesHome(loc, filesHome), realpathOrNull(dir)])
  if (!realHome || !realDir || !isInsideHome(realHome, realDir)) return null
  return { dir: realDir, filesHome: realHome }
}
