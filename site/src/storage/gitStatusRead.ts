/**
 * A folder's git status at a glance (`git.status`, spec part 4): branch or detached commit, the count of changed
 * files, the last commit, and a merge or rebase stopped halfway. Read only, and nothing the repository holds runs.
 *
 * ## Why git never reads the repository's own configuration here
 *
 * `git status` hashes a file whose timestamps moved, and runs any `filter.<name>.clean` the repository's attributes
 * name while doing so. So git runs over a git directory of the site's own (`./gitShadow.ts`, whose header has the
 * rest), with links to the repository's `refs`, `objects` and `info` and the index read in place (`GIT_INDEX_FILE`).
 * The `-c` switches stay as a second line of defence.
 *
 * ## Why a read never blocks an agent's commit
 *
 * `GIT_OPTIONAL_LOCKS=0`: `git status` would otherwise refresh the index and write it back under `index.lock`, and an
 * agent committing at that moment would fail on the lock.
 *
 * A `.git` that is a link, or a file (a linked worktree or a submodule's pointer elsewhere), or whose objects borrow
 * from another store (`objects/info/alternates`), is not read: it would lead the read out of the folder. It answers
 * as "not a repository".
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { GitHead, GitInProgress, GitLastCommit, GitStatusResult } from '@agenthix/core'
import { cleanGitEnv, GitCommandFailed, GitDeadline, runGit } from './gitRunner'
import { findRepository, lstatOrNull, makeShadow, readSettings } from './gitShadow'

/** Switches that keep anything configured from running, whichever config git ends up reading. */
const SAFE_SWITCHES = [
  '-c', 'core.hooksPath=/dev/null',
  '-c', 'core.fsmonitor=false',
  '-c', 'core.untrackedCache=false',
  '-c', 'diff.external=',
  '-c', 'core.pager=cat',
  '-c', 'protocol.allow=never',
]

const SUBJECT_MAX = 300
const AUTHOR_MAX = 200

function gitEnv(gitDir: string, workTree: string, indexFile: string): NodeJS.ProcessEnv {
  return { ...cleanGitEnv(), GIT_OPTIONAL_LOCKS: '0', GIT_DIR: gitDir, GIT_WORK_TREE: workTree, GIT_INDEX_FILE: indexFile }
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
  const repo = await findRepository(dir)
  if (!repo) return { repository: false }
  const { gitDir, head } = repo
  const { config, copied } = await readSettings(path.join(gitDir, 'config'), deadline)
  const shadow = await makeShadow(repo, config, ['refs', 'objects', 'packed-refs', 'info', 'reftable', 'shallow'])
  try {
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
