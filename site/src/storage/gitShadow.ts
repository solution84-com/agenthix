/**
 * Running git over a folder an agent writes, as the site's own process, with nothing the folder holds reaching git as
 * configuration or code. Used by the status read (`./gitStatusRead.ts`) and by repository work (`./repoOps.ts`).
 *
 * ## A git directory of the site's own
 *
 * The folder's `.git` is the agent's to write, `config` included, and this process is not sandboxed as the agent is.
 * Turning settings off with `-c` cannot be complete: a filter or URL rewrite lives under a name only the repository
 * knows, and an include can bring in anything. So git is pointed at a git directory the site makes (`GIT_DIR`): a copy
 * of `HEAD`, a config this module writes, and links to the repository's `refs`, `packed-refs` and `objects`. The
 * repository's config, hooks, `info/attributes` and `info/grafts` are never read; only a short list of settings that
 * change what counts as changed is copied over, as values, after `git config --file` has read them (which runs
 * nothing). The environment is the site's search path and proxy settings, never the rest of its own.
 *
 * ## What is not a repository here
 *
 * A `.git` that is a link or a file (a linked worktree, a submodule's pointer), one whose `HEAD`, `refs` or `objects`
 * is a link, and one whose objects borrow from another store (`objects/info/alternates`): each would lead git out of
 * the folder.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanGitEnv, GitDeadline, runGit } from './gitRunner'

/** Settings that change what git counts as changed, copied from the repository's config as values. */
const COPIED_SETTINGS = new Map<string, RegExp>([
  ['core.autocrlf', /^(true|false|input)$/i],
  ['core.eol', /^(lf|crlf|native)$/i],
  ['core.filemode', /^(true|false|yes|no|on|off|1|0)$/i],
  ['core.ignorecase', /^(true|false|yes|no|on|off|1|0)$/i],
  ['core.precomposeunicode', /^(true|false|yes|no|on|off|1|0)$/i],
  ['core.symlinks', /^(true|false|yes|no|on|off|1|0)$/i],
  ['core.checkstat', /^(default|minimal)$/i],
  ['core.trustctime', /^(true|false|yes|no|on|off|1|0)$/i],
])

const HEAD_MAX = 1024

export async function lstatOrNull(p: string) {
  try {
    return await fs.lstat(p)
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null
    throw err
  }
}

/** A regular file's text, never through a link; null when it is missing or not a regular file. */
export async function readRegular(file: string, max: number): Promise<string | null> {
  let handle: fs.FileHandle
  try {
    handle = await fs.open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
  } catch {
    return null
  }
  try {
    if (!(await handle.stat()).isFile()) return null
    const buffer = Buffer.alloc(max)
    const { bytesRead } = await handle.read(buffer, 0, max, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

export interface FoundRepository {
  gitDir: string
  /** `HEAD` as the repository holds it, trimmed. */
  head: string
}

/** The repository at `dir`, or null when its `.git` is not one git may be pointed at from here (see the header). */
export async function findRepository(dir: string): Promise<FoundRepository | null> {
  const gitDir = path.join(dir, '.git')
  if (!(await lstatOrNull(gitDir))?.isDirectory()) return null
  const [headStat, objects, refs] = await Promise.all(['HEAD', 'objects', 'refs'].map(n => lstatOrNull(path.join(gitDir, n))))
  if (!headStat?.isFile() || headStat.size > HEAD_MAX || !objects?.isDirectory() || !refs?.isDirectory()) return null
  if (await lstatOrNull(path.join(gitDir, 'objects', 'info', 'alternates'))) return null
  const head = (await readRegular(path.join(gitDir, 'HEAD'), HEAD_MAX))?.trim()
  return head ? { gitDir, head } : null
}

/** The repository's settings we copy, plus its format: read from the file alone, includes not followed. */
export async function readSettings(configFile: string, deadline: GitDeadline): Promise<{ config: string; copied: string[] }> {
  // A config git cannot read leaves the defaults; it never stops the work.
  const out = await runGit(['config', '--file', configFile, '--no-includes', '--list', '-z'], { deadline, env: cleanGitEnv() })
    .catch(() => ({ stdout: '' }))
  const found = new Map<string, string>()
  for (const entry of out.stdout.split('\0')) {
    const at = entry.indexOf('\n')
    if (at > 0) found.set(entry.slice(0, at).toLowerCase(), entry.slice(at + 1))
  }
  const version = found.get('core.repositoryformatversion') === '1' ? 1 : 0
  const objectFormat = found.get('extensions.objectformat')?.toLowerCase()
  const refStorage = found.get('extensions.refstorage')?.toLowerCase()
  const lines = ['[core]', `\trepositoryformatversion = ${version}`, '\tbare = false', '\tlogallrefupdates = false']
  const extensions: string[] = []
  if (objectFormat === 'sha1' || objectFormat === 'sha256') extensions.push(`\tobjectformat = ${objectFormat}`)
  if (refStorage === 'files' || refStorage === 'reftable') extensions.push(`\trefstorage = ${refStorage}`)
  if (version === 1 && extensions.length) lines.push('[extensions]', ...extensions)
  const copied: string[] = []
  for (const [key, allowed] of COPIED_SETTINGS) {
    const value = found.get(key)
    if (value !== undefined && allowed.test(value)) copied.push('-c', `${key}=${value}`)
  }
  return { config: lines.join('\n') + '\n', copied }
}

/**
 * A git directory of the site's own over `repo`, in the system's temporary folder: `HEAD` copied, `config` ours, and
 * `names` linked to the repository's entries where it has them. The caller removes it.
 */
export async function makeShadow(repo: FoundRepository, config: string, names: readonly string[]): Promise<string> {
  const shadow = await fs.mkdtemp(path.join(os.tmpdir(), 'site-git-'))
  await fs.writeFile(path.join(shadow, 'HEAD'), repo.head + '\n')
  await fs.writeFile(path.join(shadow, 'config'), config)
  for (const name of names) {
    if (await lstatOrNull(path.join(repo.gitDir, name))) await fs.symlink(path.join(repo.gitDir, name), path.join(shadow, name))
  }
  return shadow
}
