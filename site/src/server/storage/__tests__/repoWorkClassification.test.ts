/**
 * Which refusal each kind of failure becomes, and what the refusal is allowed
 * to say.
 *
 * Driven with the git module stubbed, because these are properties of the
 * MAPPING rather than of git: reaching `git_timeout` for real would mean
 * waiting out the site's whole ninety-second budget, and reaching `refused`
 * for real means a directory the test process cannot read, which is not a
 * thing a process running as root can arrange. The real-git behaviour those
 * stubs stand for has its own tests — `src/storage/__tests__/gitRunner.test.ts`
 * for the deadline and the kill, `src/storage/__tests__/repoOps.test.ts` for
 * the end-to-end connect.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { RepoWorkError, type LocationRef as WireLocationRef } from '@agenthix/core'
import { GitCommandFailed, GitMissing, GitTimedOut } from '../../../storage/gitRunner'

const repoOps = vi.hoisted(() => ({
  getContentState: vi.fn(),
  initAndPushRepo: vi.fn(),
  linkAndPullRepo: vi.fn(),
}))
vi.mock('../../../storage/repoOps', () => repoOps)

import { repoConnect, repoState } from '../repoWorkMethods'

const TOKEN = 'ghs_secrettoken'
const loc: WireLocationRef = { ownerType: 'project', ownerId: 'proj-0001' }
const connect = (direction: 'push' | 'pull') => ({ loc, direction, repoUrl: 'https://github.com/acme/store', token: TOKEN })

let root: string
const savedSiteRoot = process.env.SITE_ROOT
let logs: string[]

beforeEach(async () => {
  // `mockReset`, not `clearAllMocks`: clearing wipes the recorded calls and
  // leaves the IMPLEMENTATION in place, so a rejection set by one test is
  // still armed in the next — which is how a test passes for a reason it did
  // not intend.
  for (const mock of Object.values(repoOps)) mock.mockReset()
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'site-root-'))
  process.env.SITE_ROOT = root
  repoOps.getContentState.mockResolvedValue({ isGitRepo: false, hasFiles: false })
  logs = []
  const record = (...args: unknown[]) => void logs.push(args.map(String).join(' '))
  vi.spyOn(console, 'error').mockImplementation(record)
  vi.spyOn(console, 'log').mockImplementation(record)
})

afterEach(async () => {
  vi.restoreAllMocks()
  if (savedSiteRoot === undefined) delete process.env.SITE_ROOT
  else process.env.SITE_ROOT = savedSiteRoot
  await fs.rm(root, { recursive: true, force: true })
})

async function refusalOf(call: () => Promise<unknown>): Promise<RepoWorkError> {
  const err = await call().then(
    () => null,
    (e: unknown) => e,
  )
  expect(err).toBeInstanceOf(RepoWorkError)
  return err as RepoWorkError
}

describe('a failed git', () => {
  it('is a timeout when the site stopped it, and says nothing is still running', async () => {
    repoOps.initAndPushRepo.mockRejectedValue(new GitTimedOut(['-C', '/site/projects/p1/files', 'push'], 4242, true, '', ''))
    const err = await refusalOf(() => repoConnect(connect('push')))
    expect(err.code).toBe('git_timeout')
    expect(err.detail).toMatch(/nothing it started is still running/)
    expect(err.detail).not.toContain('/site/projects')
  })

  /**
   * The two outcomes of a deadline are opposite facts about the location: one
   * says nothing is writing to it, the other says something may be. Reported
   * identically — which they were — the single case where work IS still in
   * flight is the case everyone is told is finished, and nobody goes to look.
   *
   * This test fails if they ever collapse back together, on the code or on
   * the sentence.
   */
  it('is a different answer when the kill could not be confirmed, not the same one', async () => {
    repoOps.initAndPushRepo.mockRejectedValue(new GitTimedOut(['push'], 4242, true, '', ''))
    const stopped = await refusalOf(() => repoConnect(connect('push')))

    repoOps.initAndPushRepo.mockRejectedValue(new GitTimedOut(['push'], 4242, false, '', ''))
    const unstopped = await refusalOf(() => repoConnect(connect('push')))

    expect(stopped.code).toBe('git_timeout')
    expect(unstopped.code).toBe('git_abandoned')
    expect(unstopped.code).not.toBe(stopped.code)
    expect(unstopped.detail).not.toBe(stopped.detail)

    // And it says the thing an operator has to act on, rather than the
    // reassurance its sibling gives.
    expect(stopped.detail).toMatch(/nothing it started is still running/)
    expect(unstopped.detail).toMatch(/could NOT be confirmed stopped/)
    expect(unstopped.detail).toMatch(/may still be writing to this location/)
    expect(unstopped.detail).not.toMatch(/nothing it started is still running/)
  })

  /**
   * The pgid is the one thing an operator needs and the one thing that may not
   * cross to hq, so it goes in the site's own log.
   */
  it('names the process group in the site\'s own log when it could not confirm the kill', async () => {
    repoOps.initAndPushRepo.mockRejectedValue(new GitTimedOut(['push'], 4242, false, '', ''))
    const err = await refusalOf(() => repoConnect(connect('push')))
    expect(logs.join('\n')).toMatch(/could not confirm that git process group 4242 had gone/)
    expect(err.detail).not.toContain('4242')
  })

  it('is a missing binary when nothing on PATH answered to git', async () => {
    repoOps.initAndPushRepo.mockRejectedValue(new GitMissing({ code: 'ENOENT' } as NodeJS.ErrnoException))
    expect((await refusalOf(() => repoConnect(connect('push')))).code).toBe('git_missing')
  })

  it('is a rejected push when the remote refused a push', async () => {
    repoOps.initAndPushRepo.mockRejectedValue(
      new GitCommandFailed(['push'], 1, null, '', '! [rejected] main -> main (fetch first)\nerror: failed to push some refs'),
    )
    expect((await refusalOf(() => repoConnect(connect('push')))).code).toBe('push_rejected')
  })

  /**
   * The same words reach a PULL for an entirely different reason — "could not
   * read from remote repository … connection refused" matches on `refused` —
   * and answering it with "the repository already has content this push would
   * overwrite" is a sentence that is false in every part. Nothing was pushed.
   */
  it('is never a rejected push when the direction was pull', async () => {
    repoOps.linkAndPullRepo.mockRejectedValue(
      new GitCommandFailed(['fetch'], 128, null, '', 'fatal: could not read from remote repository: connection refused'),
    )
    const err = await refusalOf(() => repoConnect(connect('pull')))
    expect(err.code).toBe('git_failed')
    expect(err.detail).not.toMatch(/push/i)
  })
})

describe('a location this site may not read', () => {
  /**
   * The probe used to swallow every filesystem error, so an unreadable
   * directory answered "empty" — which let it pass an emptiness check and be
   * pulled into, and told a caller a location had no files when nobody could
   * look. The same failure `location.listFiles` refuses to make.
   */
  it('is refused, not reported as an empty location', async () => {
    repoOps.getContentState.mockRejectedValue(
      Object.assign(new Error(`EACCES: permission denied, scandir '${root}/projects/proj-0001/files'`), { code: 'EACCES' }),
    )
    const err = await refusalOf(() => repoState({ loc }))
    expect(err.code).toBe('refused')
    expect(err.detail).not.toContain(root)
  })
})

describe('parameters the method does not accept', () => {
  /**
   * `.parse()` outside the guard sent a ZodError across the channel raw: an
   * unclassified failure that reached a person as a JSON blob of issues under
   * a generic 400, bypassing the status vocabulary entirely.
   */
  it('are a refusal with a code, not a validation error crossing the channel', async () => {
    const err = await refusalOf(() => repoConnect({ loc, direction: 'sideways', repoUrl: 'u', token: TOKEN }))
    expect(err.code).toBe('invalid')
    expect(err.detail).not.toContain('{')
    await expect(repoState({ nope: true })).rejects.toBeInstanceOf(RepoWorkError)
  })

  /**
   * The params of a `repo.connect` contain the token, and a path where
   * validation failed is the one place that cannot reach for a value to redact
   * against. So only issue paths and codes are logged — never a rendered zod
   * message, never the input.
   */
  it('log where the shape was wrong and no value from it', async () => {
    await refusalOf(() => repoConnect({ loc, direction: 'sideways', repoUrl: 'u', token: TOKEN, extra: TOKEN }))
    const logged = logs.join('\n')
    expect(logged).toMatch(/direction: invalid_(enum_value|value|literal|union)/)
    expect(logged).not.toContain(TOKEN)
    expect(logged).not.toContain('sideways')
  })
})

describe('a budget that is not a number', () => {
  /**
   * `GitDeadline` throws on a non-finite budget, and it used to be constructed
   * one line ABOVE the guard — so that plain `Error` crossed the channel raw,
   * exactly the escape from this vocabulary the params parse had.
   */
  it('is a refusal with a code, not a raw error crossing the channel', async () => {
    const broken = await import('@agenthix/core')
    const spy = vi.spyOn(broken, 'REPO_CONNECT_SITE_BUDGET_MS', 'get')
    spy.mockReturnValue(undefined as unknown as number)
    try {
      const err = await refusalOf(() => repoConnect(connect('push')))
      expect(err.code).toBe('git_failed')
      expect(err.detail).not.toMatch(/non-negative/)
      expect(logs.join('\n')).toMatch(/non-negative number of milliseconds/)
    } finally {
      spy.mockRestore()
    }
  })
})
