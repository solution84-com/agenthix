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
import { GitDeadline, runGit } from './gitRunner'

const GIT_IDENTITY = ['-c', 'user.name=Agenthix', '-c', 'user.email=noreply@agenthix.dev']

/** Strip SSH syntax, URL userinfo and trailing `.git` → clean HTTPS URL with no embedded credentials. */
export const cleanUrl = (repoUrl: string) =>
  repoUrl
    .replace(/^git@github\.com:/, 'https://github.com/')
    .replace(/^(https?:\/\/)[^/]*@/, '$1')
    .replace(/\.git$/, '')

interface GitAuthEnv {
  env: NodeJS.ProcessEnv & { GIT_ASKPASS: string; GIT_TERMINAL_PROMPT: string }
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
  const body = `#!/bin/sh\ncase "$1" in\n  Username*) echo "x-access-token" ;;\n  Password*) echo "${token}" ;;\n  *) exit 1 ;;\nesac\n`
  await fs.writeFile(script, body, { mode: 0o700 })
  return {
    env: { ...process.env, GIT_ASKPASS: script, GIT_TERMINAL_PROMPT: '0' },
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
  const url = cleanUrl(repoUrl)
  await runGit(['-C', dir, 'init', '-q'], { deadline })
  await runGit(['-C', dir, 'remote', 'add', 'origin', url], { deadline })
  const auth = await withGitAuth(token)
  let branch: string | null
  try {
    await runGit(['-C', dir, 'fetch', 'origin'], { deadline, env: auth.env })
    // A private repository answers set-head only to a caller with the credential.
    branch = await remoteDefaultBranch(dir, deadline, auth.env)
  } finally {
    await auth._cleanup()
  }
  // An empty repository has no branch to check out: the location is initialised and waits for its first push.
  if (branch) await runGit(['-C', dir, 'checkout', '-B', branch, `origin/${branch}`], { deadline })
}

/** The remote's default branch, or null when the repository is empty. */
async function remoteDefaultBranch(dir: string, deadline: GitDeadline, env: NodeJS.ProcessEnv): Promise<string | null> {
  const { stdout: heads } = await runGit(['-C', dir, 'ls-remote', '--heads', 'origin'], { deadline, env })
  if (!heads.trim()) return null
  await runGit(['-C', dir, 'remote', 'set-head', 'origin', '-a'], { deadline, env })
  const { stdout } = await runGit(['-C', dir, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], { deadline })
  return stdout.trim().replace(/^origin\//, '') || 'main'
}

/**
 * Refuses a push to a repository that has content of its own unless the location's history is part of it: the
 * repository is empty, or some branch of it shares a commit with the location's. Nothing is fetched into the
 * working tree, and nothing is ever forced.
 */
async function requireSharedHistory(dir: string, deadline: GitDeadline, env: NodeJS.ProcessEnv): Promise<void> {
  const { stdout: heads } = await runGit(['-C', dir, 'ls-remote', '--heads', 'origin'], { deadline, env })
  if (!heads.trim()) return
  await runGit(['-C', dir, 'fetch', '-q', 'origin', '+refs/heads/*:refs/remotes/origin/*'], { deadline, env })
  const { stdout: refs } = await runGit(['-C', dir, 'for-each-ref', '--format=%(refname)', 'refs/remotes/origin'], { deadline })
  for (const ref of refs.split('\n').filter(Boolean)) {
    const shared = await runGit(['-C', dir, 'merge-base', 'refs/heads/main', ref], { deadline }).then(() => true).catch(() => false)
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
  const isGitRepo = await fs.access(path.join(dir, '.git')).then(() => true).catch(() => false)
  if (!isGitRepo) await runGit(['-C', dir, 'init', '-q'], { deadline })

  const hasHead = await runGit(['-C', dir, 'rev-parse', '--verify', 'HEAD'], { deadline }).then(() => true).catch(() => false)
  const branch = hasHead
    ? (await runGit(['-C', dir, 'branch', '--show-current'], { deadline })).stdout.trim()
    : null
  if (!hasHead || branch === 'main') {
    await runGit(['-C', dir, 'add', '-A'], { deadline })
    const { stdout: status } = await runGit(['-C', dir, 'status', '--porcelain'], { deadline })
    if (status.trim() || !hasHead) {
      await runGit(['-C', dir, ...GIT_IDENTITY, 'commit', '--allow-empty', '-m', 'Initial commit'], { deadline })
    }
    if (!hasHead) await runGit(['-C', dir, 'branch', '-M', 'main'], { deadline })
  }
  const hasMain = await runGit(['-C', dir, 'rev-parse', '--verify', 'refs/heads/main'], { deadline }).then(() => true).catch(() => false)

  const url = cleanUrl(repoUrl)
  const hasOrigin = await runGit(['-C', dir, 'remote', 'get-url', 'origin'], { deadline }).then(() => true).catch(() => false)
  await runGit(['-C', dir, 'remote', hasOrigin ? 'set-url' : 'add', 'origin', url], { deadline })
  if (!hasMain) return
  const auth = await withGitAuth(token)
  try {
    await requireSharedHistory(dir, deadline, auth.env)
    await runGit(['-C', dir, 'push', '-u', 'origin', 'main'], { deadline, env: auth.env })
  } finally {
    await auth._cleanup()
  }
}
