/**
 * Git for repository work (`./repoOps.ts`) in a location an agent writes: every command runs over a git directory of
 * the site's own (`./gitShadow.ts`), so nothing in the location's `.git` (its config, includes, hooks, attributes,
 * alternates) runs or decides where anything goes. The remote is the address the site was given, set in that git
 * directory's own config; the settings the site keeps in the repository's config are written there by
 * `git config --file`, which runs nothing.
 *
 * The repository's `refs`, `packed-refs` and `objects` are linked in, so branches and objects git writes land in the
 * location as they always did; the index is the location's own (`GIT_INDEX_FILE`). `HEAD` is copied in and, when git
 * moved it, written back without following a link. Reflogs are not kept.
 */
import fs from 'node:fs/promises'
import { constants as fsConstants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanGitEnv, GitDeadline, runGit } from './gitRunner'
import { findRepository, lstatOrNull, makeShadow, readRegular, readSettings, type FoundRepository } from './gitShadow'

/** Every git here runs with these, after the repository's copied settings and before its own arguments. */
const SWITCHES = [
  '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.sshCommand=false', '-c', 'credential.helper=',
  '-c', 'core.attributesFile=/dev/null', '-c', 'core.excludesFile=/dev/null', '-c', 'core.askPass=',
  '-c', 'core.pager=cat', '-c', 'core.editor=false', '-c', 'diff.external=', '-c', 'core.untrackedCache=false',
  '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'protocol.file.allow=always',
  '-c', 'submodule.recurse=false', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false',
  '-c', 'commit.gpgSign=false', '-c', 'tag.gpgSign=false', '-c', 'push.gpgSign=false', '-c', 'push.followTags=false',
  '-c', 'core.protectNTFS=true', '-c', 'core.protectHFS=true', '-c', 'advice.detachedHead=false',
  '-c', 'init.defaultBranch=main', '-c', 'branch.autoSetupMerge=false',
]

/** The repository's own entries git reads and writes through the site's git directory. */
const LINKED = ['refs', 'packed-refs', 'objects', 'reftable', 'shallow']

const EXCLUDE_MAX = 64 * 1024
const HEAD_FORM = /^(ref: refs\/heads\/[^\0\n\r]+|[0-9a-f]{40}|[0-9a-f]{64})$/

/** The address handed to git: an `https://` URL, or (for a repository on this machine) an absolute path. */
export function remoteAddress(url: string): string {
  if (/[\0\r\n]/.test(url) || !(url.startsWith('https://') || url.startsWith('/'))) {
    throw new Error('The repository address is neither an https:// URL nor a path on this machine. Nothing was changed.')
  }
  return url
}

export interface Repository {
  readonly dir: string
  readonly gitDir: string
  /** Run git over the repository, with `env` added (an askpass for the commands that reach the remote). */
  git(args: string[], env?: NodeJS.ProcessEnv): Promise<{ stdout: string }>
  /** Set a value in the repository's own config, where the agent's git will read it. */
  setConfig(key: string, value: string): Promise<void>
  /** Write `HEAD` back if git moved it, and remove the site's git directory. */
  close(): Promise<void>
}

function notARepository(): Error {
  return new Error(
    "The location's .git is not a repository the site may work in: it is a link or a file, borrows objects from " +
      'another store (objects/info/alternates), or is incomplete. Nothing was changed.',
  )
}

/** The repository at `dir` with the site's own git directory over it, the remote `origin` set to `url` in it. */
export async function openRepository(dir: string, url: string, deadline: GitDeadline): Promise<Repository> {
  const found = await findRepository(dir)
  if (!found || !HEAD_FORM.test(found.head)) throw notARepository()
  for (const name of ['index', 'packed-refs', 'config']) {
    const st = await lstatOrNull(path.join(found.gitDir, name))
    if (st && !st.isFile()) throw notARepository()
  }
  const { config, copied } = await readSettings(path.join(found.gitDir, 'config'), deadline)
  const shadow = await makeShadow(found, config, LINKED)
  const base = cleanGitEnv()
  const configIn = (file: string, key: string, value: string) =>
    runGit(['config', '--file', file, key, value], { deadline, env: { ...base, GIT_DIR: shadow } }).then(() => undefined)
  try {
    const exclude = await readRegular(path.join(found.gitDir, 'info', 'exclude'), EXCLUDE_MAX)
    if (exclude) {
      await fs.mkdir(path.join(shadow, 'info'))
      await fs.writeFile(path.join(shadow, 'info', 'exclude'), exclude)
    }
    const shadowConfig = path.join(shadow, 'config')
    await configIn(shadowConfig, 'remote.origin.url', url)
    await configIn(shadowConfig, 'remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*')
  } catch (err) {
    await fs.rm(shadow, { recursive: true, force: true })
    throw err
  }
  const env = { ...base, GIT_DIR: shadow, GIT_WORK_TREE: dir, GIT_INDEX_FILE: path.join(found.gitDir, 'index') }
  return {
    dir,
    gitDir: found.gitDir,
    git: (args, extra) => runGit([...SWITCHES, ...copied, '-C', dir, ...args], { deadline, env: { ...env, ...extra } }),
    setConfig: (key, value) => configIn(path.join(found.gitDir, 'config'), key, value),
    close: async () => {
      try {
        await writeHeadBack(found, (await fs.readFile(path.join(shadow, 'HEAD'), 'utf8')).trim())
      } finally {
        await fs.rm(shadow, { recursive: true, force: true })
      }
    },
  }
}

/** `HEAD` as git left it in the site's git directory, written to the repository through a lock file of our own. */
async function writeHeadBack(repo: FoundRepository, head: string): Promise<void> {
  if (head === repo.head) return
  if (!HEAD_FORM.test(head)) throw new Error(`git left HEAD in a form the site does not write back: ${head.slice(0, 80)}`)
  const lock = path.join(repo.gitDir, 'HEAD.lock')
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW
  const handle = await fs.open(lock, flags, 0o644)
  try {
    await handle.writeFile(head + '\n')
  } finally {
    await handle.close()
  }
  await fs.rename(lock, path.join(repo.gitDir, 'HEAD'))
}

/**
 * A new, empty repository at `dir`, on `main`. It is made by git in a folder of the site's own, then its `HEAD` and
 * config copied into a `.git` made here, so git never opens a `.git` that something else put in the location first.
 */
export async function createRepository(dir: string, deadline: GitDeadline): Promise<void> {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'site-git-init-'))
  try {
    await runGit(['init', '-q', '--template=', '-b', 'main', path.join(scratch, 'r')], { deadline, env: cleanGitEnv() })
    const made = path.join(scratch, 'r', '.git')
    const gitDir = path.join(dir, '.git')
    // Not recursive: a `.git` that appeared since the caller looked is refused, never adopted.
    await fs.mkdir(gitDir)
    for (const sub of ['objects', 'objects/info', 'objects/pack', 'refs', 'refs/heads', 'refs/tags']) {
      await fs.mkdir(path.join(gitDir, sub))
    }
    for (const file of ['HEAD', 'config']) {
      await fs.writeFile(path.join(gitDir, file), await fs.readFile(path.join(made, file)), { flag: 'wx' })
    }
  } finally {
    await fs.rm(scratch, { recursive: true, force: true })
  }
}
