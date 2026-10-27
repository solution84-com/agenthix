/**
 * A folder's git status at a glance (`git.status`, spec part 4): branch or detached commit, the count of changed
 * files, the last commit, and a merge or rebase stopped halfway. Read only, and nothing the repository holds runs.
 *
 * ## Why git never reads the repository's own configuration here
 *
 * The folder is one an agent writes, `.git/config` included, and this process is not sandboxed as the agent is. Turning
 * off hooks and `core.fsmonitor` with `-c` is not enough: `git status` hashes a file whose timestamps moved, and runs
 * any `filter.<name>.clean` the repository's attributes name while doing so, under a name only the repository knows.
 * So git is pointed at a git directory of our own (`GIT_DIR`): a copy of `HEAD`, a config this module writes, and links
 * to the repository's `refs`, `objects` and `info`, with the index read in place (`GIT_INDEX_FILE`). The repository's
 * config is never read, so no filter, `core.worktree`, include or excludes file of its choosing takes effect; only a
 * short list of settings that change what counts as changed is copied over, as values, after `git config --file`
 * has read them (which runs nothing). The `-c` switches stay as a second line of defence.
 *
 * ## Why a read never blocks an agent's commit
 *
 * `GIT_OPTIONAL_LOCKS=0`: `git status` would otherwise refresh the index and write it back under `index.lock`, and an
 * agent committing at that moment would fail on the lock.
 *
 * A `.git` that is a link, or a file (a linked worktree or a submodule's pointer elsewhere), is not read: it would
 * lead the read out of the folder. It answers as "not a repository".
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { GitHead, GitInProgress, GitLastCommit, GitStatusResult } from '@agenthix/core'
import { GitCommandFailed, GitDeadline, runGit } from './gitRunner'

/** Switches that keep anything configured from running, whichever config git ends up reading. */
const SAFE_SWITCHES = [
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.untrackedCache=false',
  '-c', 'diff.external=',
  '-c', 'core.pager=cat',
  '-c', 'protocol.allow=never',
]

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

const SUBJECT_MAX = 300
const AUTHOR_MAX = 200

async function lstatOrNull(p: string) {
  try {
    return await fs.lstat(p)
  } catch (err) {
    if ((err as NodeJS.ErrnoException | null)?.code === 'ENOENT') return null
    throw err
  }
}

/** The environment every command here runs in: nothing of the site's own git settings, nothing system-wide. */
function baseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith('GIT_')) env[key] = value
  return {
    ...env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    LC_ALL: 'C',
  }
}

function gitEnv(gitDir: string, workTree: string, indexFile: string): NodeJS.ProcessEnv {
  return { ...baseEnv(), GIT_DIR: gitDir, GIT_WORK_TREE: workTree, GIT_INDEX_FILE: indexFile }
}

/** The repository's settings we copy, plus its format: read from the file alone, includes not followed. */
async function readSettings(configFile: string, deadline: GitDeadline) {
  // A config git cannot read leaves the defaults; it never stops the read.
  const out = await runGit(['config', '--file', configFile, '--no-includes', '--list', '-z'], { deadline, env: baseEnv() })
    .catch(() => ({ stdout: '' }))
  const found = new Map<string, string>()
  for (const entry of out.stdout.split('\0')) {
    const at = entry.indexOf('\n')
    if (at > 0) found.set(entry.slice(0, at).toLowerCase(), entry.slice(at + 1))
  }
  const version = found.get('core.repositoryformatversion') === '1' ? 1 : 0
  const objectFormat = found.get('extensions.objectformat')?.toLowerCase()
  const refStorage = found.get('extensions.refstorage')?.toLowerCase()
  const lines = ['[core]', `\trepositoryformatversion = ${version}`, '\tbare = false']
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

/** Counts `git status --porcelain=v1 -z` entries; a rename or copy carries its old path as one more field. */
export function countPorcelain(stdout: string, truncated: boolean): { changed: number; overflow: boolean } {
  const fields = stdout.split('\0')
  // The last field is empty after a complete listing, or the cut-off end of a truncated one: never an entry.
  fields.pop()
  let changed = 0
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i]
    if (entry.length < 4) continue
    changed++
    if (/[RC]/.test(entry.slice(0, 2))) i++
  }
  return { changed, overflow: truncated }
}

/** `HEAD`, never through a link swapped in after the check above. */
async function readHead(file: string): Promise<string> {
  const handle = await fs.open(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
  try {
    const buffer = Buffer.alloc(1024)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).toString('utf8').trim()
  } finally {
    await handle.close()
  }
}

async function inProgress(gitDir: string): Promise<GitInProgress | null> {
  if (await lstatOrNull(path.join(gitDir, 'MERGE_HEAD'))) return 'merge'
  for (const dir of ['rebase-merge', 'rebase-apply']) if (await lstatOrNull(path.join(gitDir, dir))) return 'rebase'
  return null
}

/**
 * The status of the repository at `dir`, a real path the caller has already confined. `{ repository: false }` when
 * `dir` holds no `.git` directory of its own.
 */
export async function readGitStatus(dir: string, deadline: GitDeadline): Promise<GitStatusResult> {
  const gitDir = path.join(dir, '.git')
  const dotGit = await lstatOrNull(gitDir)
  if (!dotGit?.isDirectory()) return { repository: false }
  const [headStat, objects, refs] = await Promise.all(['HEAD', 'objects', 'refs'].map(n => lstatOrNull(path.join(gitDir, n))))
  if (!headStat?.isFile() || headStat.size > 1024 || !objects?.isDirectory() || !refs?.isDirectory()) return { repository: false }

  const head = await readHead(path.join(gitDir, 'HEAD'))
  const shadow = await fs.mkdtemp(path.join(os.tmpdir(), 'site-git-status-'))
  try {
    const { config, copied } = await readSettings(path.join(gitDir, 'config'), deadline)
    await fs.writeFile(path.join(shadow, 'HEAD'), head + '\n')
    await fs.writeFile(path.join(shadow, 'config'), config)
    for (const name of ['refs', 'objects', 'packed-refs', 'info', 'reftable', 'shallow']) {
      if (await lstatOrNull(path.join(gitDir, name))) await fs.symlink(path.join(gitDir, name), path.join(shadow, name))
    }
    const opts = { deadline, env: gitEnv(shadow, dir, path.join(gitDir, 'index')) }
    const git = (args: string[]) => runGit([...SAFE_SWITCHES, ...copied, ...args], opts)

    const hasCommit = await git(['rev-parse', '-q', '--verify', 'HEAD^{commit}']).then(() => true, (err: unknown) => {
      if (err instanceof GitCommandFailed && err.exitCode === 1) return false
      throw err
    })
    let lastCommit: GitLastCommit | null = null
    if (hasCommit) {
      const { stdout } = await git(['log', '-1', '--no-show-signature', '--format=%h%x00%an%x00%cI%x00%s', 'HEAD'])
      const [id, author, at, ...subject] = stdout.replace(/\n$/, '').split('\0')
      lastCommit = { id, author: author.slice(0, AUTHOR_MAX), at, subject: subject.join(' ').slice(0, SUBJECT_MAX) }
    }
    const status = await git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=all'])
    const { changed, overflow } = countPorcelain(status.stdout, status.stdoutTruncated)

    const branch = /^ref: refs\/heads\/(.+)$/.exec(head)?.[1]
    const headLine: GitHead = branch
      ? { kind: 'branch', name: branch }
      : { kind: 'detached', commit: lastCommit?.id ?? head.slice(0, 7) }
    return { repository: true, head: headLine, changed, changedOverflow: overflow, lastCommit, inProgress: await inProgress(gitDir) }
  } finally {
    await fs.rm(shadow, { recursive: true, force: true })
  }
}
