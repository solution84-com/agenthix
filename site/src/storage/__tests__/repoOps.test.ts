/**
 * Repository work on the side that owns the disk: the two control-channel
 * methods (`repo.state`, `repo.connect`) and the git module they drive.
 *
 * Real git against real directories, with a bare repository on this machine
 * standing in for the remote. Mocking git here would test the handler's
 * arrangement of calls and nothing about whether a repository is actually
 * connected — and repository work is the least unit-testable thing this
 * module does, which is exactly why the failure paths below are driven by
 * making git genuinely fail rather than by stubbing a rejection.
 *
 * Three properties are asserted rather than read out of the code:
 *
 *  1. **The token never comes back.** hq mints it and passes it; the site
 *     borrows it for one call. git quotes the command it ran when it fails,
 *     and a remote can be written with a credential inside it, so every
 *     failure path is checked for the token's value — in the error's code, in
 *     its message, and in every line the site logged while failing.
 *  2. **No path on this site's disk crosses back.** A raw git failure names
 *     the directory it ran in; a refusal here names the location by hq's own
 *     ids and stops.
 *  3. **The site never asks who is calling.** Neither params shape carries a
 *     user id — hq checks entitlement before it asks, and per ADR-0042 a site
 *     holds no identity store to re-derive it from.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  REPO_WORK_METHODS,
  RepoWorkError,
  type RepoConnectParams,
  type RepoStateParams,
  type LocationRef as WireLocationRef,
} from '@agenthix/core'

// channelMethods.ts reaches for `prisma` at module scope through `#db`; only `site.describe` ever touches it, and nothing here calls that.
vi.mock('#db', () => ({ prisma: {} }))

import { withGitAuth, cleanUrl } from '../repoOps'
import { repoConnect, repoState, REPO_CONNECT_PARAMS_SHAPE, REPO_STATE_PARAMS_SHAPE } from '../../server/storage/repoWorkMethods'
import { redactToken } from '../../server/storage/repoWorkRefusals'
import { channelMethods } from '../../server/hq/channelMethods'
import { locationDir } from '../../server/storage/paths'

const execFileAsync = promisify(execFile)

const TOKEN = 'ghs_secrettoken'
const projectId = 'proj-0001'
const loc: WireLocationRef = { ownerType: 'project', ownerId: projectId }
const emptyLoc: WireLocationRef = { ownerType: 'user', ownerId: 'user-0001' }

let root: string
let tmp: string
let dir: string
let remote: string
const saved = {
  siteRoot: process.env.SITE_ROOT,
  path: process.env.PATH,
  globalConfig: process.env.GIT_CONFIG_GLOBAL,
  systemConfig: process.env.GIT_CONFIG_SYSTEM,
}

/** The whole failure surface hq or an operator could read: code, message, detail, logs. */
function surfaceOf(err: unknown, logs: string[]): string {
  const e = err as { code?: string; message?: string; detail?: string }
  return [e.code ?? '', e.message ?? '', e.detail ?? '', ...logs].join('\n')
}

/** Everything the site printed while a call was failing. */
function captureLogs(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const record = (...args: unknown[]) => void lines.push(args.map(String).join(' '))
  const spies = [
    vi.spyOn(console, 'error').mockImplementation(record),
    vi.spyOn(console, 'warn').mockImplementation(record),
    vi.spyOn(console, 'log').mockImplementation(record),
  ]
  return { lines, restore: () => spies.forEach(spy => spy.mockRestore()) }
}

async function failureOf(call: () => Promise<unknown>): Promise<{ err: RepoWorkError; logs: string[] }> {
  const { lines, restore } = captureLogs()
  try {
    const err = await call().then(
      () => null,
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(RepoWorkError)
    return { err: err as RepoWorkError, logs: lines }
  } finally {
    restore()
  }
}

beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'site-repo-'))
  root = path.join(tmp, 'site-root')
  process.env.SITE_ROOT = root
  // Isolate git from whatever this machine's owner has configured — a global
  // `commit.gpgsign` or a rewritten insteadOf URL would otherwise decide
  // whether these pass.
  process.env.GIT_CONFIG_GLOBAL = '/dev/null'
  process.env.GIT_CONFIG_SYSTEM = '/dev/null'
  dir = locationDir({ ownerType: 'project', ownerId: projectId })
  await fs.mkdir(dir, { recursive: true })
  // Not named `<something>.git`: repoOps strips a trailing `.git` from a URL.
  remote = path.join(tmp, 'remote-bare')
  await execFileAsync('git', ['init', '--bare', '-b', 'main', remote])
})

afterEach(async () => {
  for (const [key, value] of [
    ['SITE_ROOT', saved.siteRoot],
    ['PATH', saved.path],
    ['GIT_CONFIG_GLOBAL', saved.globalConfig],
    ['GIT_CONFIG_SYSTEM', saved.systemConfig],
  ] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await fs.rm(tmp, { recursive: true, force: true })
})

describe('repo.state', () => {
  it('reports a directory with no git repository', async () => {
    const state = await repoState({ loc })
    expect(state).toEqual({ isGitRepo: false, hasFiles: false })
  })

  it('reports an initialised repository with files', async () => {
    await execFileAsync('git', ['-C', dir, 'init', '-q'])
    await fs.writeFile(path.join(dir, 'README.md'), 'hello')
    const state = await repoState({ loc })
    expect(state).toEqual({ isGitRepo: true, hasFiles: true })
  })

  it('does not count .git as a file — a fresh repository is still empty', async () => {
    await execFileAsync('git', ['-C', dir, 'init', '-q'])
    expect(await repoState({ loc })).toEqual({ isGitRepo: true, hasFiles: false })
  })

  it('answers for a location whose directory does not exist yet', async () => {
    expect(await repoState({ loc: emptyLoc })).toEqual({ isGitRepo: false, hasFiles: false })
  })

  it('refuses a crafted owner id without naming this site\'s storage root', async () => {
    const { err } = await failureOf(() => repoState({ loc: { ownerType: 'project', ownerId: '../escape' } }))
    expect(err.code).toBe('outside')
    expect(err.message).not.toContain(root)
    expect(err.message).not.toContain(os.tmpdir())
  })
})

describe('repo.connect', () => {
  it('pushes a location\'s files up to the repository', async () => {
    await fs.writeFile(path.join(dir, 'README.md'), 'hello')
    expect(await repoConnect({ loc, direction: 'push', repoUrl: remote, token: TOKEN })).toEqual({ connected: true })

    const { stdout } = await execFileAsync('git', ['-C', remote, 'ls-tree', '--name-only', 'main'])
    expect(stdout.trim().split('\n')).toContain('README.md')
    expect((await repoState({ loc })).isGitRepo).toBe(true)
  })

  it('pulls the repository down into an empty location', async () => {
    await fs.writeFile(path.join(dir, 'README.md'), 'hello')
    await repoConnect({ loc, direction: 'push', repoUrl: remote, token: TOKEN })

    expect(await repoConnect({ loc: emptyLoc, direction: 'pull', repoUrl: remote, token: TOKEN })).toEqual({
      connected: true,
    })
    const pulled = path.join(locationDir(emptyLoc), 'README.md')
    expect(await fs.readFile(pulled, 'utf8')).toBe('hello')
  })

  it('refuses to pull into a location that already has files', async () => {
    await fs.writeFile(path.join(dir, 'README.md'), 'hello')
    const { err } = await failureOf(() => repoConnect({ loc, direction: 'pull', repoUrl: remote, token: TOKEN }))
    expect(err.code).toBe('has_files')
    // Nothing was touched: the refusal happens before git runs.
    expect(await repoState({ loc })).toEqual({ isGitRepo: false, hasFiles: true })
  })

  it('reports a push the remote rejected as its own refusal, not a fault', async () => {
    // Give the remote a history of its own, so the location's push cannot
    // fast-forward it — the `adopt` case hq has to explain to a person.
    const other = path.join(tmp, 'seed')
    await fs.mkdir(other)
    await fs.writeFile(path.join(other, 'THEIRS.md'), 'theirs')
    await execFileAsync('git', ['-C', other, 'init', '-q', '-b', 'main'])
    await execFileAsync('git', ['-C', other, 'add', '-A'])
    await execFileAsync('git', [
      '-C', other, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-m', 'theirs',
    ])
    await execFileAsync('git', ['-C', other, 'push', remote, 'main'])

    await fs.writeFile(path.join(dir, 'OURS.md'), 'ours')
    const { err } = await failureOf(() => repoConnect({ loc, direction: 'push', repoUrl: remote, token: TOKEN }))
    expect(err.code).toBe('push_rejected')
  })

  it('says so plainly when this site has no git binary', async () => {
    process.env.PATH = path.join(tmp, 'no-binaries-here')
    const { err } = await failureOf(() => repoConnect({ loc, direction: 'push', repoUrl: remote, token: TOKEN }))
    expect(err.code).toBe('git_missing')
    expect(err.detail).toMatch(/git/i)
  })

  it('reports an unreachable remote as a git failure, naming no path on this disk', async () => {
    const { err } = await failureOf(() =>
      repoConnect({ loc, direction: 'pull', repoUrl: 'https://github.invalid/acme/store', token: TOKEN }),
    )
    expect(err.code).toBe('git_failed')
    expect(err.message).not.toContain(root)
    expect(err.message).not.toContain(dir)
    expect(err.message).not.toContain(os.tmpdir())
  })
})

/**
 * The token's value is the one thing on this wire that must never travel back.
 * Every failure path is walked, including one where the URL itself carries a
 * credential — hq never builds such a URL, and the site must not depend on
 * that.
 */
describe('repo.connect never lets the token back out', () => {
  it('keeps it out of the code, the message and every log line, on every failure path', async () => {
    const credentialled = `https://x-access-token:${TOKEN}@github.invalid/acme/store`
    await fs.writeFile(path.join(dir, 'README.md'), 'hello')

    // Sequential: the last one takes git off PATH for the process.
    const failures = [
      await failureOf(() => repoConnect({ loc, direction: 'pull', repoUrl: remote, token: TOKEN })),
      await failureOf(() => repoConnect({ loc, direction: 'push', repoUrl: credentialled, token: TOKEN })),
      await failureOf(() => repoConnect({ loc: emptyLoc, direction: 'pull', repoUrl: credentialled, token: TOKEN })),
    ]
    process.env.PATH = path.join(tmp, 'no-binaries-here')
    failures.push(await failureOf(() => repoConnect({ loc: emptyLoc, direction: 'push', repoUrl: remote, token: TOKEN })))

    expect(failures.map(f => f.err.code)).toEqual(['has_files', 'git_failed', 'git_failed', 'git_missing'])
    for (const { err, logs } of failures) {
      expect(surfaceOf(err, logs)).not.toContain(TOKEN)
    }
  })

  /**
   * The assertion above is a "does not contain", which a site that never had
   * the token in hand would also pass — so on its own it does not show anything
   * keeping it out.
   *
   * This one drives a URL that carries the credential into a command that
   * fails, and the command is quoted into what the site logs. The URL is
   * stripped of its userinfo before any git command is built, so the token
   * never reaches the command line (or the process table) and the log holds the
   * clean URL. The redaction is now the second line of defence, covered on its
   * own below.
   */
  it('and a credential in the URL never reaches the command git is run with or the log', async () => {
    const credentialled = `https://x-access-token:${TOKEN}@github.invalid/acme/store`
    // A location left holding a `.git` from an earlier attempt and nothing
    // else: the emptiness rule ignores `.git`, so the pull proceeds, and
    // `git remote add origin <url>` then fails because origin is already
    // there. That failure's command is quoted into the log.
    const staleDir = locationDir(emptyLoc)
    await fs.mkdir(staleDir, { recursive: true })
    await execFileAsync('git', ['-C', staleDir, 'init', '-q', '-b', 'main'])
    await execFileAsync('git', ['-C', staleDir, 'remote', 'add', 'origin', 'https://example.invalid/old'])

    const { err, logs } = await failureOf(() =>
      repoConnect({ loc: emptyLoc, direction: 'pull', repoUrl: credentialled, token: TOKEN }),
    )

    const logged = logs.join('\n')
    expect(logged).toContain('remote add origin https://github.invalid/acme/store')
    expect(logged).not.toContain('x-access-token')
    expect(surfaceOf(err, logs)).not.toContain(TOKEN)
    // And the refusal itself carries neither the marker nor the remote: it is
    // built from the method and the location alone, so git's output never
    // enters it in the first place.
    expect(err.detail).not.toContain('<redacted>')
    expect(err.detail).not.toContain('github.invalid')
  })

  it('redacts the token wherever it appears in what git said', () => {
    const output = `fatal: unable to access 'https://x-access-token:${TOKEN}@github.invalid/acme/store/': ` +
      `Could not resolve host; remote: ${TOKEN}`
    const redacted = redactToken(output, TOKEN)
    expect(redacted).not.toContain(TOKEN)
    expect(redacted).toContain('Could not resolve host')
    expect(redacted.match(/<redacted>/g)).toHaveLength(2)
  })

  it('leaves text alone when there is no token to find', () => {
    expect(redactToken('nothing to hide', TOKEN)).toBe('nothing to hide')
    expect(redactToken('nothing to hide', '')).toBe('nothing to hide')
  })
})

describe('the git auth helper @SC-259', () => {
  /**
   * The title says what this checks and no more. The token IS on disk while
   * the script exists — that is how an askpass helper works — so the property
   * is that the script answers the prompt, that it is the only place the token
   * goes (never the remote URL, never `.git/config`), and that it is removed
   * afterwards. An earlier version of this test claimed "leaving no token on
   * disk" and checked no disk state at all.
   */
  it('answers a credential prompt with the token, and the script is gone after cleanup', async () => {
    const auth = await withGitAuth(TOKEN)
    const script = auth.env.GIT_ASKPASS
    expect(script).toBeTruthy()

    const { stdout } = await execFileAsync(script, ['Password for https://github.com'], { env: auth.env })
    expect(stdout.trim()).toBe(TOKEN)
    // It is on disk, in the OS temp directory and not under this site's
    // storage root, for exactly as long as the call needs it.
    expect(await fs.readFile(script, 'utf8')).toContain(TOKEN)
    expect(script.startsWith(root)).toBe(false)

    await auth._cleanup()
    await expect(fs.access(script)).rejects.toThrow()
    await expect(fs.access(path.dirname(script))).rejects.toThrow()
  })

  it('answers a username prompt with a fixed non-secret value, never the token', async () => {
    const auth = await withGitAuth(TOKEN)
    try {
      const { stdout } = await execFileAsync(auth.env.GIT_ASKPASS, ["Username for 'https://github.com': "], { env: auth.env })
      expect(stdout.trim()).toBe('x-access-token')
      expect(stdout).not.toContain(TOKEN)
    } finally {
      await auth._cleanup()
    }
  })

  it('strips userinfo from a repository URL, so no credential reaches the remote or the process table', () => {
    expect(cleanUrl('https://user:ghs_secret@github.com/acme/repo.git')).toBe('https://github.com/acme/repo')
    expect(cleanUrl('https://ghs_secret@github.com/acme/repo')).toBe('https://github.com/acme/repo')
    expect(cleanUrl('http://u:p@ss@host:3000/acme/repo.git')).toBe('http://host:3000/acme/repo')
    expect(cleanUrl('git@github.com:acme/repo.git')).toBe('https://github.com/acme/repo')
    expect(cleanUrl('https://github.com/acme/repo.git')).toBe('https://github.com/acme/repo')
  })

  it('keeps the token out of the remote URL and out of .git/config', async () => {
    await fs.writeFile(path.join(dir, 'README.md'), 'hello')
    await repoConnect({ loc, direction: 'push', repoUrl: remote, token: TOKEN })
    expect(await fs.readFile(path.join(dir, '.git', 'config'), 'utf8')).not.toContain(TOKEN)
  })
})

describe('the wire', () => {
  it('registers both methods under the names core publishes', () => {
    expect(Object.keys(channelMethods)).toEqual(
      expect.arrayContaining([REPO_WORK_METHODS.connect, REPO_WORK_METHODS.state]),
    )
  })

  it('carries no caller — hq checks entitlement, the site checks nothing about identity', () => {
    const connectKeys: Record<keyof RepoConnectParams, true> = {
      loc: true, direction: true, repoUrl: true, token: true,
    }
    const stateKeys: Record<keyof RepoStateParams, true> = { loc: true }
    expect(Object.keys(REPO_CONNECT_PARAMS_SHAPE).sort()).toEqual(Object.keys(connectKeys).sort())
    expect(Object.keys(REPO_STATE_PARAMS_SHAPE).sort()).toEqual(Object.keys(stateKeys).sort())
    for (const shape of [REPO_CONNECT_PARAMS_SHAPE, REPO_STATE_PARAMS_SHAPE]) {
      expect(Object.keys(shape).some(key => /user|caller|actor/i.test(key))).toBe(false)
    }
  })
})
