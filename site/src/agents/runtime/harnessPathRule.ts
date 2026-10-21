/**
 * The gate's rule for the harness's own file tools: never the harness's home,
 * never `/proc` (spec, "Per-call authorization gate", item 6).
 *
 * Every command the agent runs is kept out of the harness by Landlock, but the
 * harness's own Read, Write, Edit, Glob and Grep run inside the harness, as its
 * user, and can open anything it can — its credentials and session database in
 * the home, and through `/proc/self/environ` its server password or API key.
 * So the gate refuses those tools any path under a protected root, judged both
 * as written (relative to the working directory, `..` collapsed) and by where
 * it really leads, so a planted link cannot lead there either.
 *
 * Read-only tools may still read a few folders inside the home that the harness
 * itself hands the model, such as the run's own staged skills; those are named
 * per run by the adapter and must hold under both judgements.
 *
 * A glob pattern is judged by the folder it starts from, the part before its
 * first wildcard, and refused if it climbs (`..`) after a wildcard, since where
 * that lands cannot be told from the pattern. A search (glob, grep) walks
 * everything below its folder, so it is also refused a folder that holds a
 * protected root, such as `/` or `/home`.
 */
import path from 'node:path'
import { HARNESS_HOME_CONTAINER_DIR } from './harnessHomes'
import { containerRealPathResolver, hostRealPathResolver } from './harnessRealPath'
import type { RealPathResolver } from './harnessRealPath'

export type { RealPathResolver }

/** What an agent's file tools may never reach in a container. */
export const CONTAINER_PROTECTED_ROOTS: readonly string[] = [HARNESS_HOME_CONTAINER_DIR, '/proc']

/** Canonical tools that read without writing, and so may use `readableRoots`. */
export const READ_ONLY_FILE_TOOLS: ReadonlySet<string> = new Set(['read_file', 'glob_files', 'grep_files'])

/** Canonical tools that walk a folder, and so reach whatever lies below the path they are given. */
const SEARCH_TOOLS: ReadonlySet<string> = new Set(['glob_files', 'grep_files'])

export interface HarnessPathPolicy {
  /** The harness's working directory, which relative paths are taken from. */
  cwd: string
  /** Refused to every file tool, as written and as resolved. */
  protectedRoots: readonly string[]
  /** Inside a protected root, still open to read-only tools. */
  readableRoots: readonly string[]
  resolveRealPath: RealPathResolver
}

export type HarnessPathRefusal = {
  /** The path as the tool call gave it. */
  path: string
  why: 'protected' | 'climbs-after-wildcard' | 'unresolved'
}

/** The policy for a harness in a container, whose home is the image user's. */
export function containerHarnessPathPolicy(
  containerName: string,
  cwd: string,
  readableRoots: readonly string[] = [],
  resolveRealPath: RealPathResolver = containerRealPathResolver(containerName),
): HarnessPathPolicy {
  return { cwd, protectedRoots: CONTAINER_PROTECTED_ROOTS, readableRoots, resolveRealPath }
}

/** The policy for a harness running on this machine, given its own home folders. */
export function hostHarnessPathPolicy(
  cwd: string,
  harnessHomes: readonly string[],
  readableRoots: readonly string[] = [],
  resolveRealPath: RealPathResolver = hostRealPathResolver,
): HarnessPathPolicy {
  return { cwd, protectedRoots: [...harnessHomes, '/proc'], readableRoots, resolveRealPath }
}

function inside(root: string, p: string): boolean {
  const r = path.posix.normalize(root).replace(/\/+$/, '')
  return r === '' || p === r || p.startsWith(`${r}/`)
}

const WILDCARD = /[*?[\]{}!]/

/** The part of `p` before its first wildcard, or null when it climbs after one. */
function withoutWildcards(p: string): string | null {
  const parts = p.split('/')
  const first = parts.findIndex(part => WILDCARD.test(part))
  if (first === -1) return p
  if (parts.slice(first).some(part => part === '..')) return null
  return parts.slice(0, first).join('/') || (p.startsWith('/') ? '/' : '.')
}

/** The part of `p` before its first wildcard, and what follows it; `rest` is empty for a plain path. */
function splitAtWildcard(p: string): { base: string; rest: string } | null {
  const base = withoutWildcards(p)
  if (base === null) return null
  if (base === p) return { base, rest: '' }
  const parts = p.split('/')
  const first = parts.findIndex(part => WILDCARD.test(part))
  return { base, rest: parts.slice(first).join('/') }
}

/**
 * Where each path of a call really leads, once all of them are checked: the
 * path as given, keyed to the same path with its folder part (before any
 * wildcard) replaced by its real path. Only paths that lead somewhere other
 * than as written appear, so an adapter can hand the harness the checked
 * target and leave every other argument as the model gave it (spec, gate
 * item 6: only a folder swapped after the check is left open).
 */
export type HarnessRealPaths = Readonly<Record<string, string>>

/**
 * Checks every path of a call under `policy` and resolves where each leads.
 * The first path `toolName` may not use is the refusal; otherwise the paths
 * that lead somewhere other than as written, and the real path each leads to.
 */
export async function resolveHarnessPaths(
  policy: HarnessPathPolicy,
  toolName: string,
  paths: readonly string[],
): Promise<{ refusal: HarnessPathRefusal } | { realPaths: HarnessRealPaths }> {
  const readOnly = READ_ONLY_FILE_TOOLS.has(toolName)
  const searches = SEARCH_TOOLS.has(toolName)
  const refused = (p: string) =>
    (policy.protectedRoots.some(root => inside(root, p)) &&
      !(readOnly && policy.readableRoots.some(root => inside(root, p)))) ||
    (searches && policy.protectedRoots.some(root => inside(p, root)))

  const realOf = new Map<string, string>()
  const realPaths: Record<string, string> = {}
  for (const given of paths) {
    const split = splitAtWildcard(given)
    if (split === null) return { refusal: { path: given, why: 'climbs-after-wildcard' } }
    const written = path.posix.resolve(policy.cwd, split.base)
    let real = realOf.get(written)
    if (real === undefined) {
      if (refused(written)) return { refusal: { path: given, why: 'protected' } }
      try {
        real = path.posix.normalize(await policy.resolveRealPath(written))
      } catch {
        return { refusal: { path: given, why: 'unresolved' } }
      }
      if (refused(real)) return { refusal: { path: given, why: 'protected' } }
      realOf.set(written, real)
    }
    if (real !== written) realPaths[given] = split.rest ? path.posix.join(real, split.rest) : real
  }
  return { realPaths }
}

/**
 * The first path of `paths` that `toolName` may not use under `policy`, or
 * null when all of them are fine. Paths are POSIX, absolute or relative to the
 * policy's working directory; glob patterns are allowed.
 */
export async function checkHarnessPaths(
  policy: HarnessPathPolicy,
  toolName: string,
  paths: readonly string[],
): Promise<HarnessPathRefusal | null> {
  const result = await resolveHarnessPaths(policy, toolName, paths)
  return 'refusal' in result ? result.refusal : null
}

/** The steering text for a refusal, in the gate's voice. */
export function harnessPathRefusalText(toolName: string, refusal: HarnessPathRefusal): string {
  switch (refusal.why) {
    case 'climbs-after-wildcard':
      return `${toolName} cannot use the pattern ${refusal.path}: a pattern may not climb with ".." after a wildcard. Start it from the folder you mean instead.`
    case 'unresolved':
      return `${toolName} could not check where ${refusal.path} leads, so the call was not run. Try again, or use a path inside the project.`
    default:
      return `${toolName} cannot reach ${refusal.path}: the harness's own files and /proc are not available to agent tools. Work with the project's files instead.`
  }
}
