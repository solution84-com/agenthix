/**
 * Repo ops (ADR-0039) — direction-aware, non-destructive git over a storage dir.
 * Generalised from the reference branch to operate on any `dir` (a workspace's
 * dir OR an owner's files dir).
 *
 *   initAndPushRepo  — the dir is the source of truth → git init + commit + push UP
 *   linkAndPullRepo  — the repo is the source of truth → init + fetch + checkout DOWN
 *                      (requires an empty dir; never `git clone` into an existing dir)
 *   getContentState  — { isGitRepo, hasFiles } (ignores .git)
 *
 * Token injection: withGitAuth writes a temp GIT_ASKPASS script that answers a password
 * prompt with the token (and a username prompt with a fixed non-secret name). The token
 * is never embedded in the remote URL or persisted in .git/config (closes SC-259 /
 * PAT-leak Finding 1).
 *
 * Nothing the location's `.git` holds runs or decides where anything goes: every command runs through
 * `./repoGit.ts`, over a git directory of the site's own, with the remote the site was given. That module's header
 * has the rest.
 *
 * Every invocation goes through `./gitRunner.ts` rather than `execFile`, and
 * every one of them shares ONE deadline for the whole call. Nine commands with
 * a timeout each would add up past the budget hq is holding; and without a
 * deadline that is enforced and a kill that is confirmed, a stalled git keeps
 * writing into a location after the call it belongs to has already failed.
 * That module's header has the rest.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { RepoWorkError } from '@agenthix/core'
import { GitDeadline } from './gitRunner'
import { createRepository, openRepository, remoteAddress, type Repository } from './repoGit'

export { openRepository } from './repoGit'

const GIT_IDENTITY = ['-c', 'user.name=Agenthix', '-c', 'user.email=noreply@agenthix.dev']

/** Strip SSH syntax, URL userinfo and trailing `.git` → clean HTTPS URL with no embedded credentials. */
export const cleanUrl = (repoUrl: string) =>
  repoUrl
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^(https?:\/\/)[^/]*@/, '$1')
    .replace(/\.git$/, '')

interface GitAuthEnv {
  /** Added to the environment of the commands that reach the remote. */
  env: { GIT_ASKPASS: string; GIT_TERMINAL_PROMPT: string }
  _cleanup: () => Promise<void>
}

/**
 * Build an env that injects `token` into git over HTTPS via GIT_ASKPASS — the token
 * is never written to .git/config or the remote URL. Caller must `_cleanup()`.
 */
export async function withGitAuth(token: string): Promise<GitAuthEnv> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'agenthix-askpass-'))
  const script = path.join(dir, 'askpass.sh')
  // The username is not a secret and must not be the token (a proxy or a log may record it);
  // only a password prompt is answered with the token, and anything else is refused.
  // Single-quoted, so nothing in the token is read by the shell.
  const quoted = `'${token.split("'").join(`'\\''`)}'`
  const body = `#!/bin/sh\ncase "$1" in\n  Username*) echo "x-access-token" ;;\n  Password*) printf '%s\\n' ${quoted} ;;\n  *) exit 1 ;;\nesac\n`
  await fs.writeFile(script, body, { mode: 0o700 })
  return {
    env: { GIT_ASKPASS: script, GIT_TERMINAL_PROMPT: '0' },
    _cleanup: () => fs.rm(dir, { recursive: true, force: true }),
  }
}

async function listContent(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir).catch((err: NodeJS.ErrnoException) => {
    // Only "it is not there" reads as empty — a location whose disk has not
    // been provisioned yet is an ordinary state. A directory this process may
    // NOT read is a refusal: reporting it as empty is how a broken location
    // passes an emptiness check and gets pulled into, and how a caller is told
    // a repository has no files when nobody could look.
    if (err?.code === 'ENOENT') return [] as string[]
    throw err
  })
  return entries.filter(e => e !== '.git')
}

export async function getContentState(dir: string): Promise<{ isGitRepo: boolean; hasFiles: boolean }> {
  const isGitRepo = await fs.access(path.join(dir, '.git')).then(() => true).catch(() => false)
  const content = await listContent(dir)
  return { isGitRepo, hasFiles: content.length > 0 }
}

/** Pull an existing repo DOWN into an empty dir. Throws if the dir already has files. */
export async function linkAndPullRepo(dir: string, repoUrl: string, token: string, deadline: GitDeadline): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  if ((await listContent(dir)).length > 0) {
    throw new Error('This location already has files — linking would overwrite them. Use Back up / Init to push these up instead, or link into an empty location.')
  }
  const url = remoteAddress(cleanUrl(repoUrl))
  if (!(await hasDotGit(dir))) await createRepository(dir, deadline)
  await withRepository(dir, url, deadline, async repo => {
    await repo.setConfig('remote.origin.url', url)
    await repo.setConfig('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*')
    const auth = await withGitAuth(token)
    let branch: string | null
    try {
      await repo.git(['fetch', 'origin'], auth.env)
      // A private repository answers set-head only to a caller with the credential.
      branch = await remoteDefaultBranch(repo, auth.env)
    } finally {
      await auth._cleanup()
    }
    // An empty repository has no branch to check out: the location is initialised and waits for its first push.
    if (branch) {
      await repo.git(['checkout', '-B', branch, `origin/${branch}`])
      await setUpstream(repo, branch)
    }
  })
}

const hasDotGit = (dir: string) => fs.lstat(path.join(dir, '.git')).then(() => true, () => false)

async function withRepository(dir: string, url: string, deadline: GitDeadline, work: (repo: Repository) => Promise<void>) {
  const repo = await openRepository(dir, url, deadline)
  try {
    await work(repo)
  } finally {
    await repo.close()
  }
}

async function setUpstream(repo: Repository, branch: string): Promise<void> {
  await repo.setConfig(`branch.${branch}.remote`, 'origin')
  await repo.setConfig(`branch.${branch}.merge`, `refs/heads/${branch}`)
}

/** The remote's default branch, or null when the repository is empty. */
async function remoteDefaultBranch(repo: Repository, env: NodeJS.ProcessEnv): Promise<string | null> {
  const { stdout: heads } = await repo.git(['ls-remote', '--heads', 'origin'], env)
  if (!heads.trim()) return null
  await repo.git(['remote', 'set-head', 'origin', '-a'], env)
  const { stdout } = await repo.git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  return stdout.trim().replace(/^origin\//, '') || 'main'
}

/**
 * Refuses a push to a repository that has content of its own unless the location's history is part of it: the
 * repository is empty, or some branch of it shares a commit with the location's. Nothing is fetched into the
 * working tree, and nothing is ever forced.
 */
async function requireSharedHistory(repo: Repository, env: NodeJS.ProcessEnv): Promise<void> {
  const { stdout: heads } = await repo.git(['ls-remote', '--heads', 'origin'], env)
  if (!heads.trim()) return
  await repo.git(['fetch', '-q', 'origin', '+refs/heads/*:refs/remotes/origin/*'], env)
  const { stdout: refs } = await repo.git(['for-each-ref', '--format=%(refname)', 'refs/remotes/origin'])
  for (const ref of refs.split('\n').filter(Boolean)) {
    const shared = await repo.git(['merge-base', 'refs/heads/main', ref]).then(() => true).catch(() => false)
    if (shared) return
  }
  throw new RepoWorkError(
    'push_rejected',
    'the repository already has its own history, which the files in this location do not share, so nothing was pushed',
  )
}

/**
 * Init the dir and push its files UP to an (empty) repo. The dir is the source of truth. A dir with history of its
 * own keeps its branches as they are: its files are committed only while `main` is checked out, and only `main` is
 * pushed, never the branch an agent is working on, which reaches GitHub through the push workflow.
 */
export async function initAndPushRepo(dir: string, repoUrl: string, token: string, deadline: GitDeadline): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  const url = remoteAddress(cleanUrl(repoUrl))
  if (!(await hasDotGit(dir))) await createRepository(dir, deadline)
  await withRepository(dir, url, deadline, async repo => {
    const hasHead = await repo.git(['rev-parse', '--verify', 'HEAD']).then(() => true).catch(() => false)
    const branch = hasHead ? (await repo.git(['branch', '--show-current'])).stdout.trim() : null
    if (!hasHead || branch === 'main') {
      await repo.git(['add', '-A'])
      const { stdout: status } = await repo.git(['status', '--porcelain'])
      if (status.trim() || !hasHead) {
        await repo.git([...GIT_IDENTITY, 'commit', '--allow-empty', '-m', 'Initial commit'])
      }
      if (!hasHead) await repo.git(['branch', '-M', 'main'])
    }
    const hasMain = await repo.git(['rev-parse', '--verify', 'refs/heads/main']).then(() => true).catch(() => false)

    await repo.setConfig('remote.origin.url', url)
    await repo.setConfig('remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*')
    if (!hasMain) return
    const auth = await withGitAuth(token)
    try {
      await requireSharedHistory(repo, auth.env)
      await repo.git(['push', 'origin', 'main'], auth.env)
    } finally {
      await auth._cleanup()
    }
    await setUpstream(repo, 'main')
  })
}
