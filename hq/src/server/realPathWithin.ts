/**
 * Real-path confinement for hq's reads from, and writes to, directories agents can
 * write to (spec §4.30).
 * A textual `..` check stops a caller's path, not a symbolic link an agent planted:
 * fs follows links, so a read resolves the real path first and refuses one that
 * has left the directory it serves.
 *
 * `base` must be a directory agents cannot replace — a location's mount root —
 * because a link planted at `base` itself would move the boundary with it. Where
 * the base IS replaceable, the caller has to establish separately that it has
 * not been. A missing path and a path outside both return null, so a refusal
 * reveals nothing about what exists outside.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

export async function resolveRealPathWithin(base: string, target: string): Promise<string | null> {
  try {
    const [realBase, realTarget] = await Promise.all([fs.realpath(base), fs.realpath(target)])
    return realTarget === realBase || realTarget.startsWith(realBase + path.sep) ? realTarget : null
  } catch {
    return null
  }
}

/**
 * Where hq may write or remove `target`, a path under `base` that need not exist
 * yet, or null when doing so could reach outside `base` (spec §4.30).
 *
 * `target` is the lexical path built from the same helpers as `base`, never an
 * already-resolved one. The deepest part of it that exists must resolve inside
 * `base`, and the missing rest is appended to that real path: hq creates those
 * parts itself, so none of them is a link. A target that exists as a symbolic
 * link is refused even when it points inside, because hq replaces or removes an
 * agent's file and never acts through a link to one. When `base` itself does not
 * exist yet, nothing under it can be a link, so `target` comes back as given.
 *
 * Same residual as resolveRealPathWithin: a component swapped for a link between
 * this check and the write is not caught.
 */
export async function resolveRealWriteTargetWithin(base: string, target: string): Promise<string | null> {
  const absBase = path.resolve(base)
  const absTarget = path.resolve(target)
  if (absTarget !== absBase && !absTarget.startsWith(absBase + path.sep)) return null

  const missing: string[] = []
  let current = absTarget
  for (;;) {
    let isLink: boolean
    try {
      isLink = (await fs.lstat(current)).isSymbolicLink()
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') return null
      if (current === absBase) return absTarget
      missing.unshift(path.basename(current))
      current = path.dirname(current)
      continue
    }
    if (isLink && current === absTarget) return null
    const real = await resolveRealPathWithin(absBase, current)
    return real === null ? null : path.join(real, ...missing)
  }
}
