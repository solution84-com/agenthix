/**
 * Skills staged for one run (spec §6.2, ruling P20). Each source keeps its own
 * namespace — `platform-`, `org-`, `agent-`, `boundary-` (one agent's, on the
 * boundary's disk) and `shared-` (every agent's, on the boundary's disk) — so
 * two skills with one slug both reach the run and the run can say which it
 * used. The staged SKILL.md's front matter is rebuilt (skillFrontmatter.ts):
 * its `name` matches its directory, as skill names must, and keys that would
 * run commands or change the harness's behaviour are left out.
 *
 * The `boundary` and `shared` sources are the roots on writable, agent-reachable
 * disk (P18) — everything under them is real-path-checked against the boundary's
 * files home before every directory read and every file read (`skills/`
 * itself, not just `.agents/agents/<agentId>`, can be replaced by a link
 * out), rechecked at each level rather than trusted from the one resolution
 * done at launch (a TOCTOU concern, including the parent-directory variant
 * of it), and bounded so a pathological tree can't stall or bloat a launch.
 * Nothing here ever throws out of `stageSkills` — a broken or hostile
 * boundary tree degrades to fewer staged skills, never a failed run.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import path from 'node:path'
import { namespacedSkillName, type SkillSource } from '@agenthix/core'
import type { ResolvedRunPackages } from '../../packages/runPackages'
import {
  realpathOrNull, isInsideHome, readFileNoFollow, realpathOfFd,
  type BoundaryOverride, type NoFollowReadReason,
} from '../../packages/boundaryOverrides'
import { Logger } from '../../server/utils/logger'
import { stagedSkillMd } from './skillFrontmatter'

const logger = new Logger('SkillStaging')

/** Per-run bounds on the boundary's own tree — package caches (platform/org/agent)
 *  are site-owned and hq-verified, so they stay unbounded and simple. */
export const MAX_BOUNDARY_ENTRIES = 1000
export const MAX_BOUNDARY_BYTES = 16 * 1024 * 1024
export const MAX_BOUNDARY_DEPTH = 8

export type SkillRoot = { source: SkillSource; dir: string; sandboxHome?: string }
export type StagedSkill = { source: SkillSource; slug: string; name: string }

export function skillRootsFor(
  packages: Pick<ResolvedRunPackages, 'agentDir' | 'orgDir' | 'platformDir'>,
  boundaryOverride: BoundaryOverride | null,
  boundarySharedSkills: BoundaryOverride | null = null,
): SkillRoot[] {
  const roots: SkillRoot[] = [{ source: 'platform', dir: path.join(packages.platformDir, 'skills') }]
  if (packages.orgDir) roots.push({ source: 'org', dir: path.join(packages.orgDir, 'skills') })
  roots.push({ source: 'agent', dir: path.join(packages.agentDir, 'skills') })
  if (boundaryOverride) {
    roots.push({ source: 'boundary', dir: path.join(boundaryOverride.dir, 'skills'), sandboxHome: boundaryOverride.filesHome })
  }
  if (boundarySharedSkills) {
    roots.push({ source: 'shared', dir: boundarySharedSkills.dir, sandboxHome: boundarySharedSkills.filesHome })
  }
  return roots
}

type BoundaryBudget = { entries: number; bytes: number }
type Sandbox = { home: string; budget: BoundaryBudget; warned: Set<string> }

function warnOnce(sandbox: Sandbox, key: string, message: string): void {
  if (sandbox.warned.has(key)) return
  sandbox.warned.add(key)
  logger.warn(message)
}

/** One entry (file or directory) against the boundary's shared per-run
 *  budget — the skill folder itself and its SKILL.md each take one, same as
 *  every entry copyTree walks. Always true, no-op, for an unsandboxed
 *  (package-cache) root. */
function takeEntryBudget(sandbox: Sandbox | null): boolean {
  if (!sandbox) return true
  if (sandbox.budget.entries <= 0) {
    warnOnce(sandbox, 'entries', `boundary skill staging: truncated — entry limit (${MAX_BOUNDARY_ENTRIES}) reached`)
    return false
  }
  sandbox.budget.entries -= 1
  return true
}

function warnForUnsafeRead(sandbox: Sandbox, file: string, reason: NoFollowReadReason): void {
  switch (reason) {
    case 'link':
    case 'outside-sandbox':
      warnOnce(sandbox, `link:${file}`, `boundary skill staging: refused a symlink or hard link: ${file}`)
      break
    case 'too-large':
      warnOnce(sandbox, 'bytes', `boundary skill staging: truncated — size limit (${MAX_BOUNDARY_BYTES} bytes) reached`)
      break
    case 'not-regular':
      warnOnce(sandbox, `not-regular:${file}`, `boundary skill staging: refused a non-regular file: ${file}`)
      break
    case 'unreadable':
      warnOnce(sandbox, `unreadable:${file}`, `boundary skill staging: skipped an unreadable file: ${file}`)
      break
    case 'missing':
      // A candidate that no longer exists by the time it's read (deleted,
      // or simply never had a SKILL.md) is unremarkable — nothing to warn.
      break
  }
}

/**
 * Real-path-checked `readdir`, hardened against two different races:
 *  1. Refuses, and logs once, a directory whose real path resolves outside
 *     the sandbox home — the check a symlink anywhere in the chain
 *     (the root itself, e.g. `skills/` replaced wholesale, or any directory
 *     nested under it) cannot get past.
 *  2. That check is itself a path-string `realpath` done BEFORE the actual
 *     read — a symlink swapped into `dir` or a parent
 *     component between the two can still get past it. Where `/proc/self/fd`
 *     is available (Linux), opening `dir` and re-resolving what THAT
 *     descriptor refers to narrows this: it closes the race for confirming
 *     what was opened. It does not close it entirely — `fs/promises` has no
 *     supported way to list entries from an already-open directory
 *     descriptor, so the `fs.readdir(dir, …)` call below still re-resolves
 *     `dir` by path, leaving a second, much narrower window between closing
 *     the verification handle and that call. On Linux, a descriptor whose real
 *     path cannot be read is refused. On a platform without `/proc`
 *     (macOS, the dev platform), this second check is skipped entirely and
 *     the pre-open path check in (1) is the only defense against either race.
 * Unsandboxed (package-cache) roots skip both checks. Never throws.
 */
async function safeReaddir(dir: string, sandbox: Sandbox | null): Promise<import('node:fs').Dirent[] | null> {
  if (sandbox) {
    const real = await realpathOrNull(dir)
    if (!real || !isInsideHome(sandbox.home, real)) {
      warnOnce(sandbox, `dir:${dir}`, `boundary skill staging: refused a directory outside the files home: ${dir}`)
      return null
    }
    let handle
    try {
      handle = await fs.open(dir, fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW)
    } catch {
      return null
    }
    try {
      const realFd = await realpathOfFd(handle.fd)
      if (realFd !== null && !isInsideHome(sandbox.home, realFd)) {
        warnOnce(sandbox, `dir:${dir}`, `boundary skill staging: refused a directory outside the files home: ${dir}`)
        return null
      }
    } catch {
      warnOnce(sandbox, `dir:${dir}`, `boundary skill staging: refused a directory whose real path could not be confirmed: ${dir}`)
      return null
    } finally {
      await handle.close().catch(() => {})
    }
  }
  try {
    return await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
}

/**
 * Real-path-checked, symlink-refusing, budget-aware file read: the
 * containing directory is rechecked against the sandbox home, and the file
 * itself is read through `readFileNoFollow` — `O_NOFOLLOW` refuses a link,
 * `O_NONBLOCK` keeps a FIFO from hanging the open forever, the sandbox's
 * open-descriptor recheck narrows the parent-directory race, and the
 * remaining byte budget is passed through as `maxBytes` so an oversized file
 * is refused by its `fstat` size alone, without ever being read into memory.
 * On success, the bytes actually read are debited from the sandbox's byte
 * budget. Unsandboxed reads skip the containment recheck and the budget, but
 * still use the same safe, non-throwing, non-blocking open.
 */
async function safeReadFile(file: string, sandbox: Sandbox | null): Promise<Buffer | null> {
  if (sandbox) {
    const realDir = await realpathOrNull(path.dirname(file))
    if (!realDir || !isInsideHome(sandbox.home, realDir)) {
      warnOnce(sandbox, `dir:${path.dirname(file)}`, `boundary skill staging: refused a file outside the files home: ${file}`)
      return null
    }
  }
  const result = await readFileNoFollow(file, {
    maxBytes: sandbox ? sandbox.budget.bytes : undefined,
    sandboxHome: sandbox ? sandbox.home : undefined,
  })
  if (!result.ok) {
    if (sandbox) warnForUnsafeRead(sandbox, file, result.reason)
    return null
  }
  if (sandbox) sandbox.budget.bytes -= result.buf.byteLength
  return result.buf
}

/**
 * Copies a directory tree, refusing to follow any symlink entry and — for a
 * sandboxed (boundary) source — bounded to `MAX_BOUNDARY_ENTRIES` entries,
 * `MAX_BOUNDARY_BYTES` total, and `MAX_BOUNDARY_DEPTH` levels deep, so one
 * pathological boundary tree can't stall or bloat a launch. Past any cap, or
 * on an unreadable entry or a failed write, the entry is skipped (one warning
 * per cap, one per file) — never thrown, so staging never aborts the run.
 * `skipName` leaves out one entry of `src` itself (not of its subdirectories).
 */
async function copyTree(src: string, dest: string, sandbox: Sandbox | null, depth = 0, skipName?: string): Promise<void> {
  if (sandbox && depth > MAX_BOUNDARY_DEPTH) {
    warnOnce(sandbox, 'depth', `boundary skill staging: truncated — depth limit (${MAX_BOUNDARY_DEPTH}) reached`)
    return
  }
  const entries = await safeReaddir(src, sandbox)
  if (!entries) return
  try {
    await fs.mkdir(dest, { recursive: true })
  } catch (err) {
    logger.warn(`boundary skill staging: could not create ${dest}: ${(err as Error).message}`)
    return
  }
  for (const entry of entries) {
    if (entry.name === skipName) continue
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)

    if (entry.isSymbolicLink()) {
      if (sandbox) warnOnce(sandbox, `link:${from}`, `boundary skill staging: refused a symlink: ${from}`)
      continue
    }

    if (!takeEntryBudget(sandbox)) return

    if (entry.isDirectory()) {
      await copyTree(from, to, sandbox, depth + 1)
    } else if (entry.isFile()) {
      const buf = await safeReadFile(from, sandbox)
      if (buf === null) continue // safeReadFile already warned as appropriate
      try {
        await fs.writeFile(to, buf)
      } catch (err) {
        if (sandbox) warnOnce(sandbox, `write:${to}`, `boundary skill staging: skipped a file that could not be staged: ${to} (${(err as Error).message})`)
      }
    }
  }
}

export async function stageSkills(roots: SkillRoot[], destSkillsDir: string): Promise<StagedSkill[]> {
  const staged: StagedSkill[] = []
  // Shared across every boundary root in this call (one agent's and the
  // boundary's shared skills) — the cap is per run, not per skill or root.
  const boundaryBudget: BoundaryBudget = { entries: MAX_BOUNDARY_ENTRIES, bytes: MAX_BOUNDARY_BYTES }
  const boundaryWarned = new Set<string>()

  for (const root of roots) {
    const sandbox: Sandbox | null = root.sandboxHome
      ? { home: root.sandboxHome, budget: boundaryBudget, warned: boundaryWarned }
      : null

    const entries = await safeReaddir(root.dir, sandbox)
    if (!entries) continue

    const candidates = entries
      .filter(e => {
        if (e.isSymbolicLink()) {
          if (sandbox) warnOnce(sandbox, `link:${path.join(root.dir, e.name)}`, `boundary skill staging: refused a symlink: ${path.join(root.dir, e.name)}`)
          return false
        }
        return e.isDirectory()
      })
      .sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of candidates) {
      const name = namespacedSkillName(root.source, entry.name)
      if (!name) {
        // An invalid folder still costs a directory read, so a boundary tree of
        // them draws on the same budget, and warns once rather than per folder.
        if (!sandbox) {
          logger.warn(`skill ${root.source}/${entry.name} skipped: "${root.source}-${entry.name}" is not a valid skill name`)
          continue
        }
        if (!takeEntryBudget(sandbox)) break
        warnOnce(sandbox, 'invalid-name', `boundary skill staging: skipped folders that are not valid skill names, first ${entry.name}`)
        continue
      }
      // The skill folder itself, then its SKILL.md, each count as one entry
      // against the boundary's shared per-run budget.
      if (!takeEntryBudget(sandbox)) break
      if (!takeEntryBudget(sandbox)) break

      const src = path.join(root.dir, entry.name)
      const dest = path.join(destSkillsDir, name)
      try {
        const skillMdBuf = await safeReadFile(path.join(src, 'SKILL.md'), sandbox)
        if (!skillMdBuf) continue
        // Created unconditionally, before anything is written into it —
        // copyTree can itself fail to list `src` (permissions, or a race
        // that swaps it away between here and its own read) and return
        // without ever creating `dest`; staging still succeeds with at
        // least this skill's own (rewritten) SKILL.md rather than the run's
        // launch failing on a missing directory.
        await fs.mkdir(dest, { recursive: true })
        // SKILL.md was read and charged above; the copy leaves it out.
        await copyTree(src, dest, sandbox, 0, 'SKILL.md')
        await fs.writeFile(path.join(dest, 'SKILL.md'), stagedSkillMd(skillMdBuf.toString('utf-8'), name), 'utf-8')
        staged.push({ source: root.source, slug: entry.name, name })
      } catch (err) {
        // Any other failure in staging this one skill — never the run's launch.
        logger.warn(`skill ${root.source}/${entry.name} skipped: ${(err as Error).message}`)
      }
    }
  }
  return staged
}
