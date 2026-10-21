/**
 * The one way a credentials document is written into a harness home.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Writes `contents` to `dest` without ever leaving `dest` truncated or
 * half-written: a reader (Claude Code inside the container, or a concurrent
 * writer) that catches a plain write mid-flight sees a corrupt credentials
 * file. Writes a temp file IN THE SAME DIRECTORY as `dest` first — same
 * filesystem, which `fs.rename` needs to be atomic — and renames over the
 * destination, which POSIX guarantees is atomic: any reader sees either the
 * old complete file or the new complete one, never a partial one. The temp
 * name is unique per call so two concurrent writers never collide on the temp
 * file itself. On failure, best-effort removes the temp file before
 * rethrowing.
 *
 * The same mechanism the per-agent seeding used for its copy; it writes a
 * string rather than copying a file, because the document now arrives from hq
 * in the dispatch payload rather than off this machine's disk.
 */
export async function writeFileAtomic(dest: string, contents: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true })
  const tmpDest = path.join(
    path.dirname(dest),
    `.${path.basename(dest)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  try {
    await fs.writeFile(tmpDest, contents, { mode: 0o600 })
    await fs.rename(tmpDest, dest)
  } catch (err) {
    await fs.unlink(tmpDest).catch(() => {})
    throw err
  }
}
