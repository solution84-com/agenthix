/**
 * The site's package cache (ADR-0072): content hq delivered, verified against
 * its digest and stored whole under SITE_ROOT/packages/<digest>/ — `files/` and
 * `package.json`. Keyed by digest alone, so content is fetched once per site per
 * change, whoever it belongs to. An entry is assembled under .incoming/ and
 * renamed into place, so a reader sees all of it or none of it. Nothing here
 * ever changes a stored entry.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import {
  PACKAGE_FORMAT_VERSION, PACKAGE_MAX_BYTES, PACKAGE_DIGEST_PATTERN, SKILL_TREE_MAX_DEPTH, SKILL_TREE_MAX_ENTRIES,
  checkAssetFileList, isPackageRef, isValidPackagePath, packageDigestInput,
  type PackageContents, type PackageRef, type PackageTransfer,
} from '@agenthix/core'
import { getSiteRoot } from '../agents/agentDiskPaths'
import { skillHasTooManyEntries, skillIsTooDeep } from './skillBounds'

export class PackageUnavailableError extends Error {
  readonly code = 'package_unavailable' as const
  constructor(readonly ref: PackageRef) {
    super(`package_unavailable: the ${ref.kind} package ${ref.key} (content ${ref.digest.slice(0, 12)}) is not in this site's cache — the run does not use any other content`)
    this.name = 'PackageUnavailableError'
  }
}

export class PackageVerificationError extends Error {
  constructor(message: string) { super(message); this.name = 'PackageVerificationError' }
}

export type CachedPackage = { digest: string; dir: string; bytes: number; lastUsedMs: number }

const META_FILE = 'package.json'
const FILES_DIR = 'files'
export const INCOMING_DIR = '.incoming'

export function getPackageCacheRoot(): string {
  return path.join(getSiteRoot(), 'packages')
}

export function packageDir(ref: PackageRef): string {
  if (!isPackageRef(ref)) throw new PackageVerificationError('Invalid package reference')
  return path.join(getPackageCacheRoot(), ref.digest)
}

export function packageFilesDir(ref: PackageRef): string {
  return path.join(packageDir(ref), FILES_DIR)
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function hasPackage(ref: PackageRef): Promise<boolean> {
  return exists(path.join(packageDir(ref), META_FILE))
}

/** Marks cached content used for least-recently-used eviction — the same
 *  technique `resolvePackage` uses, shared so `missingPackages` can mark a hit
 *  used too. */
async function touchPackage(ref: PackageRef): Promise<void> {
  const now = new Date()
  await fs.utimes(path.join(packageDir(ref), META_FILE), now, now).catch(() => {})
}

/**
 * Every ref hq finds already cached counts as used, not merely missing-or-not:
 * hq calls `packages.missing` before dispatching or resuming a run, and
 * before a prompt preview that never creates a run row at
 * all — none of those create the AgentRun that would otherwise protect the
 * content from eviction, so confirming it is present must itself renew
 * its eviction grace the same way actually loading it would.
 */
export async function missingPackages(refs: PackageRef[]): Promise<string[]> {
  const missing: string[] = []
  for (const ref of refs) {
    if (await hasPackage(ref)) await touchPackage(ref)
    else missing.push(ref.digest)
  }
  return missing
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')

function sameRef(a: PackageRef, b: PackageRef): boolean {
  return a.kind === b.kind && a.key === b.key && a.digest === b.digest
}

/**
 * A skill's content is held to the bounds a skill in files is (security review L4): unsigned uploads and personal
 * skills now arrive here, so the cache's own trust in hq is not enough to stage it unbounded.
 */
function checkSkillContents(contents: PackageContents): void {
  const paths = contents.files.map(f => f.path)
  if (skillHasTooManyEntries(paths)) throw new PackageVerificationError(`A skill may hold at most ${SKILL_TREE_MAX_ENTRIES} files and folders, its own included`)
  if (skillIsTooDeep(paths)) throw new PackageVerificationError(`A skill's folders may be at most ${SKILL_TREE_MAX_DEPTH} deep`)
  if (!paths.includes('SKILL.md')) throw new PackageVerificationError('A skill package has no SKILL.md')
  if (checkAssetFileList(paths).length > 0) throw new PackageVerificationError('A skill package names two files one disk would store as one')
}

export async function storeVerifiedPackage(expected: PackageRef, body: Buffer): Promise<void> {
  // base64 grows content by a third; the JSON around it is small.
  if (body.length > PACKAGE_MAX_BYTES * 2) throw new PackageVerificationError('Package transfer is larger than any package may be')
  let transfer: PackageTransfer
  try {
    transfer = JSON.parse(body.toString('utf-8')) as PackageTransfer
  } catch {
    throw new PackageVerificationError('Package transfer is not valid JSON')
  }
  const { ref, contents, data } = transfer ?? ({} as PackageTransfer)
  if (!isPackageRef(expected) || !isPackageRef(ref) || !sameRef(ref, expected)) {
    throw new PackageVerificationError('Package transfer does not match the reference it was sent for')
  }
  if (!contents || contents.formatVersion !== PACKAGE_FORMAT_VERSION || !Array.isArray(contents.files)) {
    throw new PackageVerificationError(`Package format ${String(contents?.formatVersion)} is not one this site loads`)
  }
  if (typeof data !== 'object' || data === null) throw new PackageVerificationError('Package transfer carries no file data')

  const decoded = new Map<string, Buffer>()
  let totalBytes = 0
  for (const entry of contents.files) {
    if (typeof entry !== 'object' || entry === null || typeof entry.path !== 'string' || typeof entry.sha256 !== 'string') {
      throw new PackageVerificationError('Package contents list a file entry that is not a well-formed path/hash pair')
    }
    if (!isValidPackagePath(entry.path) || decoded.has(entry.path)) {
      throw new PackageVerificationError(`Invalid or repeated package path ${JSON.stringify(entry.path)}`)
    }
    const encoded = data[entry.path]
    if (typeof encoded !== 'string') throw new PackageVerificationError(`File ${entry.path} has no data`)
    const bytes = Buffer.from(encoded, 'base64')
    totalBytes += bytes.length
    if (totalBytes > PACKAGE_MAX_BYTES) throw new PackageVerificationError('Package contents are larger than any package may be')
    if (sha256(bytes) !== entry.sha256) throw new PackageVerificationError(`File ${entry.path} does not match its hash`)
    decoded.set(entry.path, bytes)
  }
  if (Object.keys(data).length !== decoded.size) throw new PackageVerificationError('Package transfer carries data for files it does not list')
  if (sha256(packageDigestInput(contents)) !== ref.digest) throw new PackageVerificationError('Package digest does not match its contents')
  if (ref.kind === 'skill') checkSkillContents(contents)

  if (await hasPackage(ref)) return

  const incoming = path.join(getPackageCacheRoot(), INCOMING_DIR, randomUUID())
  try {
    await fs.mkdir(path.join(incoming, FILES_DIR), { recursive: true })
    for (const [relative, bytes] of decoded) {
      const dest = path.join(incoming, FILES_DIR, ...relative.split('/'))
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, bytes)
    }
    await fs.writeFile(path.join(incoming, META_FILE), JSON.stringify({ ref, contents }, null, 2))
    const final = packageDir(ref)
    await fs.mkdir(path.dirname(final), { recursive: true })
    try {
      await fs.rename(incoming, final)
    } catch (err) {
      if (await hasPackage(ref)) {
        // A concurrent put of the same content won the rename; theirs is identical.
      } else if (await exists(final)) {
        // The target exists but has no package.json — a stale directory left by
        // an interrupted eviction delete or an earlier crash. Clear it and
        // retry the rename once.
        await fs.rm(final, { recursive: true, force: true })
        await fs.rename(incoming, final)
      } else {
        throw err
      }
    }
  } finally {
    await fs.rm(incoming, { recursive: true, force: true }).catch(() => {})
  }
}

/** The content's files directory. Marks it used for least-recently-used eviction. */
export async function resolvePackage(ref: PackageRef): Promise<string> {
  if (!(await hasPackage(ref))) throw new PackageUnavailableError(ref)
  await touchPackage(ref)
  return packageFilesDir(ref)
}

async function directoryBytes(dir: string): Promise<number> {
  let total = 0
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[])
  for (const entry of entries) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) total += await directoryBytes(p)
    else if (entry.isFile()) total += (await fs.stat(p)).size
  }
  return total
}

/**
 * Removes leftover `.incoming/<uuid>` directories from a crash mid-put.
 * `maxAgeMs` guards the periodic sweep
 * against removing a put that is genuinely still in flight — a directory
 * younger than that is left alone. At boot nothing can legitimately be
 * mid-flight yet, so the caller passes `0` there to clear every leftover
 * unconditionally.
 */
export async function sweepIncomingDir(maxAgeMs = 60 * 60 * 1000): Promise<number> {
  const incomingRoot = path.join(getPackageCacheRoot(), INCOMING_DIR)
  const entries = await fs.readdir(incomingRoot, { withFileTypes: true }).catch(() => [] as import('node:fs').Dirent[])
  const now = Date.now()
  let swept = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const dir = path.join(incomingRoot, entry.name)
    if (maxAgeMs > 0) {
      const stat = await fs.stat(dir).catch(() => null)
      if (!stat || now - stat.mtimeMs < maxAgeMs) continue
    }
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
    swept++
  }
  return swept
}

/** Every cached entry. Anything else under the cache root — including an earlier layout's directories — is not listed. */
export async function listCachedPackages(): Promise<CachedPackage[]> {
  const root = getPackageCacheRoot()
  const cached: CachedPackage[] = []
  for (const name of await fs.readdir(root).catch(() => [] as string[])) {
    if (!PACKAGE_DIGEST_PATTERN.test(name)) continue
    const dir = path.join(root, name)
    const meta = await fs.stat(path.join(dir, META_FILE)).catch(() => null)
    if (!meta) continue
    cached.push({ digest: name, dir, bytes: await directoryBytes(dir), lastUsedMs: meta.mtimeMs })
  }
  return cached
}
