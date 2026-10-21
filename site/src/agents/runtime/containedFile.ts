/**
 * Reads and writes a file inside a root such that the containment check and
 * the read or write are the SAME resolution of the path, not two.
 *
 * `read_file`/`write_file` run in the site server process against storage
 * every agent and member of a project can write. Checking a path and then
 * reading it by path again leaves a window in which another agent can swap a
 * symbolic link in and steer the operation anywhere on the disk. So the path is
 * resolved and checked once, then opened ONCE, and everything after that
 * happens on the descriptor, which cannot be re-pointed:
 *
 *  1. Resolve the target's real path (links included, so a link that points
 *     back inside the root still works) and require it inside the real root.
 *  2. Open that real path with `O_NOFOLLOW`. It should contain no links at all
 *     now, so a link at the final component — swapped in since step 1 — fails
 *     the open outright.
 *  3. Confirm the descriptor is the file the check approved, before a byte is
 *     read or written:
 *     - on every platform, walk the real path from the root with `lstat`,
 *       refusing any link among its directories, and require the last entry to
 *       be the same device and inode the descriptor holds. A parent directory
 *       swapped for a link makes the open land elsewhere, and this refuses it;
 *     - on Linux (the site's container image) also read where the descriptor
 *       really is from `/proc/self/fd`, which the kernel answers from the open
 *       file itself, so no swap sequence can fool it.
 *     macOS (the development platform) has no `/proc`, and Node exposes neither
 *     `openat` nor `F_GETPATH`, so there the walk alone stands; a swap that is
 *     undone before the walk runs could get a read past it, which is why Linux
 *     adds the descriptor lookup rather than relying on the walk.
 *  4. A write is only truncated and written through the descriptor, AFTER step
 *     3. The open itself never truncates, so an outside file reached by a race
 *     is refused untouched.
 *
 * The same primitives serve the location methods hq calls on a person's or
 * project's storage (`server/storage/locationContainment.ts`), which agents can
 * write in the same way, and `location.remove`'s walk (`descriptorPath` lets it
 * act through an open directory on Linux).
 *
 * What a race can still do on a write: the open creates the file if it is
 * missing, and missing parent directories are created first, both by path — so
 * a parent swapped at that instant can leave an EMPTY file or directory outside
 * the root before step 3 refuses. Never content, never a truncation.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants, type Stats } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WorkspaceService } from '../agentDiskPaths'
import { realpathOfFd, isInsideHome } from '../../packages/boundaryOverrides'

export type FileHandle = Awaited<ReturnType<typeof fs.open>>
export type Resolved = { realRoot: string; realTarget: string }

const PROC_FD = os.platform() === 'linux'

function forbidden(label: string): Error {
  return new Error(`Forbidden: ${label}`)
}

/** `target` (absolute) checked lexically, then by real path, to be `root` or inside it. */
export async function resolveContained(root: string, target: string, label: string): Promise<Resolved> {
  const lexical = WorkspaceService.validatePath(target, root, label)
  const [realRoot, realTarget] = await Promise.all([
    WorkspaceService.resolveRealPath(path.resolve(root)),
    WorkspaceService.resolveRealPath(lexical),
  ])
  if (!isInsideHome(realRoot, realTarget)) throw forbidden(label)
  return { realRoot, realTarget }
}

/**
 * Steps 2 and 3 of this module's header: opens the already-resolved real path
 * once, never following a link at its last part, and confirms the descriptor
 * before handing it back. The handle is closed on any refusal.
 */
export async function openResolved({ realRoot, realTarget }: Resolved, flags: number, label: string): Promise<FileHandle> {
  let handle: FileHandle
  try {
    handle = await fs.open(realTarget, flags | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK, 0o666)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    if (code === 'ELOOP') throw forbidden(label)
    // macOS answers a link opened with O_DIRECTORY | O_NOFOLLOW with ENOTDIR,
    // not ELOOP. Only the refusal's wording depends on this lstat.
    if (code === 'ENOTDIR' && (flags & fsConstants.O_DIRECTORY)) {
      const entry = await fs.lstat(realTarget).catch(() => null)
      if (entry?.isSymbolicLink()) throw forbidden(label)
    }
    throw err
  }
  try {
    await confirmDescriptor(handle, realRoot, realTarget, label)
    return handle
  } catch (err) {
    await handle.close().catch(() => {})
    throw err
  }
}

export async function openContained(root: string, target: string, flags: number, label: string): Promise<FileHandle> {
  return openResolved(await resolveContained(root, target, label), flags, label)
}

/**
 * Step 3 of this module's header: is `handle` still the entry a link-free walk
 * from `realRoot` to `realTarget` finds, and (on Linux) does the kernel place
 * it inside `realRoot`? Callers that go on to act on a directory by path run
 * it again afterwards, to catch a swap made while they were acting.
 */
export async function confirmDescriptor(handle: FileHandle, realRoot: string, realTarget: string, label: string): Promise<void> {
  const opened = await handle.stat({ bigint: true })
  const parts = path.relative(realRoot, realTarget).split(path.sep).filter(Boolean)
  let current = realRoot
  let entry = await fs.lstat(current, { bigint: true }).catch(() => null)
  for (const part of parts) {
    if (!entry || !entry.isDirectory()) throw forbidden(label)
    current = path.join(current, part)
    entry = await fs.lstat(current, { bigint: true }).catch(() => null)
    if (!entry || entry.isSymbolicLink()) throw forbidden(label)
  }
  if (!entry || entry.dev !== opened.dev || entry.ino !== opened.ino) throw forbidden(label)
  let fromDescriptor: string | null
  try {
    fromDescriptor = await realpathOfFd(handle.fd)
  } catch {
    throw forbidden(label)
  }
  if (fromDescriptor !== null && !isInsideHome(realRoot, fromDescriptor)) throw forbidden(label)
}

/**
 * A path that names what an open DIRECTORY descriptor holds. On Linux it is
 * `/proc/self/fd/<fd>`, which the kernel resolves through the descriptor
 * itself, so a name joined onto it is looked up in THAT directory whatever has
 * been renamed or linked since — the `openat` Node does not expose. Elsewhere
 * it is the directory's real path, and the caller confirms the descriptor
 * again after acting on it.
 */
export function descriptorPath(handle: FileHandle, realPath: string): string {
  return PROC_FD ? `/proc/self/fd/${handle.fd}` : realPath
}

/** True where `descriptorPath` pins the directory, so no re-confirmation is needed. */
export const DESCRIPTOR_PATHS_PINNED = PROC_FD

/**
 * What `target` resolves to, or null when it resolves outside `root` or to
 * nothing — for a listing, which drops such an entry rather than failing.
 * Opened and confirmed like any read, so the size and kind are those of the
 * entry the check approved.
 */
export async function statContained(root: string, target: string): Promise<Stats | null> {
  let handle: FileHandle
  try {
    handle = await openContained(root, target, fsConstants.O_RDONLY, 'outside')
  } catch {
    return null
  }
  try {
    return await handle.stat()
  } catch {
    return null
  } finally {
    await handle.close().catch(() => {})
  }
}

function notRegular(relPath: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`EISDIR: not a regular file, '${relPath}'`), { code: 'EISDIR' })
}

/** Reads `relPath` under `root` as UTF-8. Throws `Forbidden: <label>` for anything outside it. */
export async function readContainedFile(root: string, relPath: string, label: string): Promise<string> {
  const handle = await openContained(root, path.join(root, relPath), fsConstants.O_RDONLY, label)
  try {
    if (!(await handle.stat()).isFile()) throw notRegular(relPath)
    return await handle.readFile({ encoding: 'utf8' })
  } finally {
    await handle.close().catch(() => {})
  }
}

/** Creates or replaces `relPath` under `root`. Throws `Forbidden: <label>` for anything outside it. */
export async function writeContainedFile(root: string, relPath: string, content: string, label: string): Promise<void> {
  const resolved = await resolveContained(root, path.join(root, relPath), label)
  await fs.mkdir(path.dirname(resolved.realTarget), { recursive: true })
  const handle = await openResolved(resolved, fsConstants.O_WRONLY | fsConstants.O_CREAT, label)
  try {
    if (!(await handle.stat()).isFile()) throw notRegular(relPath)
    await handle.truncate(0)
    await handle.writeFile(content, { encoding: 'utf8' })
  } finally {
    await handle.close().catch(() => {})
  }
}
