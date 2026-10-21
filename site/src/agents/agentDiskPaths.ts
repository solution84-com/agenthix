/**
 * Site-machine disk paths, and the only place they are written down. hq used to
 * keep a mirror of this file for the features that touched this disk directly;
 * those features cross the control channel now, and hq reads nothing on this
 * disk — so everything here, `getSiteRoot` included, is site's alone.
 */
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'

/** Absolute path to the site data root — org files, runtime skills, the
 *  runners' harness homes (runtime/harnessHomes.ts). */
export function getSiteRoot(): string {
  const raw = process.env.SITE_ROOT || path.join(process.cwd(), 'site')
  return raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw
}

/**
 * Returns the root directory for whatever is left on this site's disk under an
 * agent's own name. Nothing is created here any more: the harness home a run
 * gets belongs to its boundary and its runner (runtime/harnessHomes.ts), and an
 * agent has no working directory of its own — a run works in its storage
 * boundary. What an upgraded install still has here is the per-person memory
 * ADR-0058 superseded, which the boot sweep sets aside (memorySupersede.ts).
 * Used for the delete hq asks for when an agent is removed.
 */
export function getAgentDir(handle: string): string {
  return path.join(getSiteRoot(), 'agents', handle)
}

/** Where a run's Claude folder sits inside the container: `.claude/` in the
 *  harness home, which is bound whole at the image user's home directory
 *  (runtime/harnessHomes.ts). The staging bind and the run-visible path are
 *  built from this one constant (runtime/boundaryClaudeHome.ts). */
export const AGENT_CONTAINER_CLAUDE_HOME = '/home/appuser/.claude'

/**
 * Every agent handle with a directory on this site's disk. Site has no Agent
 * table (SC-338), so the boot sweep that needs "every agent" — the
 * superseded-memory sweep, and only that one now — resolves the set from the
 * agents/ directory itself rather than from an agent table it does not have.
 * (The orphan-container sweep used to be named here too; it keys on the
 * storage boundary a container belongs to, ADR-0057, and never on an agent.)
 *
 * Nothing creates a directory here any more — a run's harness home belongs to
 * its boundary and runner — so on a fresh install this enumerates nothing and the sweep
 * it feeds is a no-op. Its premise is unchanged, because the sweep's subject
 * is unchanged: whatever per-person memory an UPGRADED install still has under
 * `agents/<handle>/`, written before ADR-0058 moved that to hq.
 *
 * NOT the same set hq's `prisma.agent` query returned, and deliberately a
 * SUPERSET of live agents, not an exact match (spec review): a deleted
 * agent's directory can linger here after the row is gone, so the
 * superseded-memory sweep still runs harmlessly against a directory nothing
 * references anymore — conservative rather than under-swept, and never a
 * reason to skip real work.
 *
 * One asymmetry the other direction, noted rather than fixed (spec review):
 * `Dirent.isDirectory()` is false for a symlink even when it points AT a
 * directory (Node's dirent type reflects the link itself, not its target),
 * so a symlinked agent directory — nothing in this codebase creates one
 * today — would be silently skipped here. Acceptable: there is no known path
 * that produces one, and the failure mode if it ever did is "under-swept",
 * the same conservative direction as the superset case above, not a
 * security or correctness hazard.
 */
export async function listAgentHandles(): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(getSiteRoot(), 'agents'), { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    return []
  }
}

export class WorkspaceService {
  static getWorkspaceRoot(): string {
    return path.join(getSiteRoot(), 'agents')
  }

  /**
   * Validates that a path is within a sandbox root. Returns the absolute, resolved
   * path if valid. Throws an error (with a 403-like message) if the path escapes
   * the sandbox.
   *
   * `root` defaults to the shared `site/agents` root (whatever is left of
   * every agent's tree) — the boundary most callers want (hq's file-browser queries/actions). Pass a
   * narrower root to scope validation to the storage a single run works in (pass that
   * run's working tree): a relative path that escapes THAT root — another
   * owner's storage, or anywhere else outside the run's own boundary — must be
   * refused even though it would resolve inside the wider shared root.
   * `boundaryLabel` customises the refusal message's boundary description
   * without ever echoing the resolved target path (which would leak the disk
   * layout to the caller).
   */
  static validatePath(targetPath: string, root: string = this.getWorkspaceRoot(), boundaryLabel?: string): string {
    const resolvedRoot = path.resolve(root)
    const resolvedPath = path.resolve(targetPath || resolvedRoot)

    if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Forbidden: ${boundaryLabel ?? `Access outside authorized workspace root (${resolvedRoot})`}`)
    }

    return resolvedPath
  }

  /**
   * SC-351 follow-up: `validatePath` above is
   * PURELY LEXICAL — `path.resolve`/`startsWith` never touch the filesystem,
   * so a symlink living INSIDE the sandbox root that points OUTSIDE it
   * resolves lexically inside the root and sails through, even though
   * following it at read/write time lands somewhere the boundary was meant
   * to refuse. For a file operation executed
   * IN THE SITE SERVER PROCESS, not inside the agent's container, this
   * lexical check is the ENTIRE boundary protecting `secrets/.claude/` and
   * every sibling agent's tree — worth a second, filesystem-aware pass.
   *
   * Kept as a SEPARATE async function rather than folded into `validatePath`
   * itself: `validatePath` is synchronous and several existing callers
   * (the hq file-browser actions/queries mirror) rely
   * on that sync signature. This one is additive and strictly narrower — it
   * never widens what `validatePath` already allowed, only refuses a symlink
   * escape `validatePath` alone cannot see.
   *
   * Resolves reality for BOTH the target and the root the same way (via the
   * private `resolveRealPath` below), then requires the target's real form
   * to equal-or-descend the root's real form — the boundary is where reality
   * LANDS, not the mechanism that got there: a symlink pointing OUTSIDE the
   * sandbox is refused, but one that points to another location back INSIDE
   * the sandbox is allowed, same as it would be if the caller had just named
   * that location directly. This is the simpler of the two reasonable rules
   * named in the finding this closes (refusing every symlink crossing, even
   * an inside-to-inside one, was the alternative) — chosen because
   * containment is the actual property this function exists to guarantee,
   * and an inside-to-inside symlink never breaks it.
   *
   * Resolving BOTH sides through the identical process (not just the target)
   * is load-bearing, not a style choice: `getSiteRoot()` on a real deployment
   * commonly sits under a symlinked path (e.g. macOS's own `os.tmpdir()`,
   * `/var/...` → `/private/var/...`), and resolving only the target's realpath
   * while comparing it against the ROOT'S LEXICAL form would make every
   * write inside a perfectly legitimate, non-symlinked sandbox look like an
   * escape the moment any ancestor of the target happens to exist while the
   * root itself does not yet.
   */
  static async validatePathReal(targetPath: string, root: string = this.getWorkspaceRoot(), boundaryLabel?: string): Promise<string> {
    const resolvedPath = this.validatePath(targetPath, root, boundaryLabel)
    const resolvedRoot = path.resolve(root)

    const [realRoot, realTarget] = await Promise.all([
      this.resolveRealPath(resolvedRoot),
      this.resolveRealPath(resolvedPath),
    ])

    if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
      throw new Error(`Forbidden: ${boundaryLabel ?? `Access outside authorized workspace root (${resolvedRoot})`}`)
    }
    return resolvedPath
  }

  /**
   * Resolves `p` to its real, symlink-free form: `fs.realpath`s the deepest
   * EXISTING ancestor of `p` (walking up when the leaf, or several levels of
   * it, don't exist yet — `write_file`'s target commonly doesn't), then
   * re-appends whatever suffix doesn't exist yet LEXICALLY — nothing there
   * to resolve, since it isn't on disk. Falls back to `p` itself unresolved
   * only if NO ancestor exists all the way up to the filesystem root, which
   * doesn't happen once any real mounted root exists.
   */
  static async resolveRealPath(p: string): Promise<string> {
    let probe = p
    let suffix = ''
    while (true) {
      try {
        const real = await fs.realpath(probe)
        return suffix ? path.join(real, suffix) : real
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err
        const parent = path.dirname(probe)
        if (parent === probe) return p // reached the filesystem root unresolved — nothing further to do
        suffix = suffix ? path.join(path.basename(probe), suffix) : path.basename(probe)
        probe = parent
      }
    }
  }

  static getVirtualPaths(absolutePath: string) {
    const root = path.resolve(this.getWorkspaceRoot())
    const relative = path.relative(root, absolutePath)
    const relativeParent = path.relative(root, path.dirname(absolutePath))

    return {
      virtualPath: relative || '/',
      virtualParentPath: (absolutePath === root ? '/' : relativeParent) || '/'
    }
  }

  static async ensureRootExists(): Promise<string> {
    const root = this.getWorkspaceRoot()
    await fs.mkdir(root, { recursive: true })
    return root
  }

  static getProjectsRoot(): string {
    return path.join(getSiteRoot(), 'projects')
  }
}
