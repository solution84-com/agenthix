/**
 * One skill folder read into memory, under staging's bounds (spec part 4 *Defaults and switches*, security review H3,
 * L1, L4). What is read is what is fingerprinted and what is staged: staging writes these bytes, never the folder again,
 * so a file changed after the read cannot reach a run.
 *
 * Hidden entries (`.git`, `.DS_Store`) and `__MACOSX` are left out by name and never opened, so the fingerprint is
 * the one hq and a scan compute over the same folder. Everything else must be a plain directory or a regular file:
 * a symbolic link, a hard link, a device or a pipe anywhere inside refuses the whole folder, as does a tree over the
 * entry, byte or depth bound, a file list that cannot be fingerprinted (two names one disk would store as one) or a
 * folder without `SKILL.md`.
 *
 * With a `home`, the folder sits on disk agents and people write: every directory is real-path-checked against it
 * before it is listed, and every file is read through `readFileNoFollow`'s same-descriptor checks. Without one, it is
 * the site's package cache, which no container reaches; it is still bounded, since unsigned uploads and personal
 * skills now arrive there. Never throws.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants, type Dirent } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  SKILL_TREE_MAX_BYTES, SKILL_TREE_MAX_DEPTH, SKILL_TREE_MAX_ENTRIES,
  assetFingerprintInput, checkAssetFileList, isMetadataPath,
} from '@agenthix/core'
import { isInsideHome, readFileNoFollow, realpathOfFd, realpathOrNull } from '../../packages/boundaryOverrides'

export const SKILL_FILE = 'SKILL.md'

/** What is left of the bounds one scan, or one run's staging, may read in all. */
export type SkillTreeBudget = { entries: number; bytes: number }

export function newSkillTreeBudget(): SkillTreeBudget {
  return { entries: SKILL_TREE_MAX_ENTRIES, bytes: SKILL_TREE_MAX_BYTES }
}

export function budgetSpent(budget: SkillTreeBudget): boolean {
  return budget.entries <= 0 || budget.bytes <= 0
}

export type SkillFile = { path: string; content: Buffer }

export type SkillTreeRefusal = 'link' | 'bounds' | 'unreadable' | 'no-skill' | 'file-list'

export type SkillTreeRead =
  | { ok: true; files: SkillFile[] }
  | { ok: false; reason: SkillTreeRefusal; detail: string }

/** The words a refusal is reported in, on the run's record and in a scan's problems. */
export const SKILL_TREE_REFUSALS: Record<SkillTreeRefusal, string> = {
  link: 'it holds a symbolic or hard link',
  bounds: `it is larger than a skill may be (${SKILL_TREE_MAX_ENTRIES} entries, ${SKILL_TREE_MAX_BYTES / (1024 * 1024)} MiB, ${SKILL_TREE_MAX_DEPTH} levels)`,
  unreadable: 'a file in it could not be read as a regular file',
  'no-skill': `it has no ${SKILL_FILE}`,
  'file-list': 'two of its files have names one disk would store as one, or a name a skill may not use',
}

class Refused extends Error {
  constructor(readonly reason: SkillTreeRefusal, readonly detail: string) { super(detail) }
}

type Reader = { home: string | null; budget: SkillTreeBudget }

/** A directory's entries, only once its real path, and the descriptor opened on it, are inside the home. */
async function listDir(dir: string, home: string | null): Promise<Dirent[]> {
  if (home) {
    const real = await realpathOrNull(dir)
    if (!real || !isInsideHome(home, real)) throw new Refused('link', dir)
    let handle
    try {
      handle = await fs.open(dir, fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW)
    } catch (err) {
      throw new Refused((err as NodeJS.ErrnoException).code === 'ELOOP' ? 'link' : 'unreadable', dir)
    }
    try {
      const realFd = await realpathOfFd(handle.fd).catch(() => '')
      if (realFd !== null && !isInsideHome(home, realFd)) throw new Refused('link', dir)
    } finally {
      await handle.close().catch(() => {})
    }
  }
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    throw new Refused('unreadable', dir)
  }
}

function takeEntry(reader: Reader, at: string): void {
  if (reader.budget.entries <= 0) throw new Refused('bounds', at)
  reader.budget.entries -= 1
}

async function walk(reader: Reader, dir: string, prefix: string, depth: number, out: SkillFile[]): Promise<void> {
  if (depth > SKILL_TREE_MAX_DEPTH) throw new Refused('bounds', dir)
  const entries = (await listDir(dir, reader.home)).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  for (const entry of entries) {
    if (isMetadataPath(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) throw new Refused('link', full)
    takeEntry(reader, full)
    if (entry.isDirectory()) {
      await walk(reader, full, `${prefix}${entry.name}/`, depth + 1, out)
    } else if (entry.isFile()) {
      const read = await readFileNoFollow(full, { maxBytes: reader.budget.bytes, ...(reader.home ? { sandboxHome: reader.home } : {}) })
      if (!read.ok) {
        const reason: SkillTreeRefusal = read.reason === 'link' || read.reason === 'outside-sandbox' ? 'link'
          : read.reason === 'too-large' ? 'bounds' : 'unreadable'
        throw new Refused(reason, full)
      }
      reader.budget.bytes -= read.buf.byteLength
      out.push({ path: `${prefix}${entry.name}`, content: read.buf })
    } else {
      throw new Refused('unreadable', full)
    }
  }
}

export async function readSkillTree(dir: string, opts: { home: string | null; budget: SkillTreeBudget }): Promise<SkillTreeRead> {
  const reader: Reader = { home: opts.home, budget: opts.budget }
  const files: SkillFile[] = []
  try {
    const stat = await fs.lstat(dir).catch(() => null)
    if (!stat) return { ok: false, reason: 'no-skill', detail: dir }
    if (stat.isSymbolicLink()) throw new Refused('link', dir)
    if (!stat.isDirectory()) throw new Refused('no-skill', dir)
    takeEntry(reader, dir)
    await walk(reader, dir, '', 0, files)
  } catch (err) {
    if (err instanceof Refused) return { ok: false, reason: err.reason, detail: err.detail }
    return { ok: false, reason: 'unreadable', detail: dir }
  }
  if (!files.some(f => f.path === SKILL_FILE)) return { ok: false, reason: 'no-skill', detail: dir }
  const problems = checkAssetFileList(files.map(f => f.path))
  if (problems.length > 0) return { ok: false, reason: 'file-list', detail: problems[0].path }
  return { ok: true, files }
}

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')

/** Core's fingerprint over exactly these files, written as a package digest. */
export function skillFingerprint(files: readonly SkillFile[]): string {
  return sha256(assetFingerprintInput(files.map(f => ({ path: f.path, sha256: sha256(f.content) }))))
}
