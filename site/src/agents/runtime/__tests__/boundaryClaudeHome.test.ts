import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../credentialFile', () => import('./fakeCredentialFile'))
vi.mock('../homeFolder', () => import('./fakeHomeFolder'))
vi.mock('node:fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  },
}))

vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(function () { return ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }),
}))

vi.mock('../../../server/hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: vi.fn() },
}))

import {
  clearRunCredential,
  harnessHomeBind,
  prepareHarnessHome,
  resolveVisibleClaudeHome,
  runnerClaudeHome,
  writeRunCredential,
} from '../boundaryClaudeHome'
import { holdUnreportedCredential } from '../agentCredentials'
import { runStagingBind } from '../runStaging'
import type { ContainerKey } from '../containerTypes'
import fs from 'node:fs/promises'

const mockFs = vi.mocked(fs)

const SITE_ROOT = '/site'

const PROJECT_RW: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'proj-alpha', mode: 'rw', runner: { kind: 'project', projectId: 'proj-alpha' } }
const PROJECT_RO: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'proj-alpha', mode: 'ro', runner: { kind: 'project', projectId: 'proj-alpha' } }
const ADA_IN_ALPHA: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'proj-alpha', mode: 'rw', runner: { kind: 'person', userId: 'user-ada' } }
const ADA_RW: ContainerKey = { scope: 'storage', ownerType: 'user', ownerId: 'user-ada', mode: 'rw', runner: { kind: 'person', userId: 'user-ada' } }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SITE_ROOT = SITE_ROOT
  delete process.env.AGENT_CONTAINER_ISOLATION
  mockFs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
})

describe('the Claude folder sits inside the runner\'s harness home', () => {
  it('is `.claude/` in the home keyed by boundary × runner', () => {
    expect(runnerClaudeHome(ADA_RW)).toBe(`${SITE_ROOT}/homes/users/user-ada/personal/.claude`)
    expect(runnerClaudeHome(ADA_IN_ALPHA)).toBe(`${SITE_ROOT}/homes/users/user-ada/proj-alpha/.claude`)
    expect(runnerClaudeHome(PROJECT_RW)).toBe(`${SITE_ROOT}/homes/projects/proj-alpha/.claude`)
  })

  it('gives a runner one home whatever mode its storage is bound in', () => {
    expect(runnerClaudeHome(PROJECT_RW)).toBe(runnerClaudeHome(PROJECT_RO))
  })

  it('binds the whole home at the image user\'s home directory, so every runtime\'s state sits in it', () => {
    expect(harnessHomeBind(ADA_IN_ALPHA)).toBe(`${SITE_ROOT}/homes/users/user-ada/proj-alpha:/home/appuser`)
  })

  it("mounts the runner's run staging read-only at /run/staging, outside the home (adr-0173)", () => {
    expect(runStagingBind(ADA_IN_ALPHA)).toBe(`${SITE_ROOT}/run-staging/users/user-ada/proj-alpha:/run/staging:ro`)
  })

  it('shows the run the fixed container path under isolation, and the server path without it', () => {
    process.env.AGENT_CONTAINER_ISOLATION = 'true'
    expect(resolveVisibleClaudeHome(PROJECT_RW)).toBe('/home/appuser/.claude')
    delete process.env.AGENT_CONTAINER_ISOLATION
    expect(resolveVisibleClaudeHome(PROJECT_RW)).toBe(`${SITE_ROOT}/homes/projects/proj-alpha/.claude`)
  })

  it('refuses a home for an id that could leave the homes tree', () => {
    const odd: ContainerKey = { scope: 'storage', ownerType: 'user', ownerId: '..', mode: 'rw', runner: { kind: 'person', userId: '..' } }
    expect(() => runnerClaudeHome(odd)).toThrow(/unsafe/)
  })
})

describe('prepareHarnessHome', () => {
  it('creates the home, with no staging folder in it, and seeds `~/.claude.json` only when it is absent', async () => {
    await prepareHarnessHome(ADA_IN_ALPHA)

    const home = `${SITE_ROOT}/homes/users/user-ada/proj-alpha`
    expect(mockFs.mkdir).toHaveBeenCalledWith(home, { recursive: true })
    expect(mockFs.mkdir).not.toHaveBeenCalledWith(`${home}/.claude/.tmp`, expect.anything())
    // 'wx': never overwrites what Claude Code has already written there.
    expect(mockFs.writeFile).toHaveBeenCalledWith(`${home}/.claude.json`, '{}', { flag: 'wx', mode: 0o600 })
  })

  it('leaves an existing `~/.claude.json` alone', async () => {
    mockFs.writeFile.mockRejectedValueOnce(Object.assign(new Error('EEXIST'), { code: 'EEXIST' }))
    await expect(prepareHarnessHome(ADA_IN_ALPHA)).resolves.toBeUndefined()
  })

  it('fails when the home cannot be written', async () => {
    mockFs.writeFile.mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }))
    await expect(prepareHarnessHome(ADA_IN_ALPHA)).rejects.toThrow(/EACCES/)
  })
})

describe('the run\'s own credential is what lands in the home', () => {
  const HOME = `${SITE_ROOT}/homes/users/user-ada/personal/.claude`
  const DEST = `${HOME}/.credentials.json`

  /** The document that actually landed, read off the atomic temp-then-rename pair. */
  function writtenDocument(): string | null {
    if (mockFs.writeFile.mock.calls.length === 0) return null
    const [tmpPath, contents] = mockFs.writeFile.mock.calls[0] as unknown as [string, string]
    expect(tmpPath).not.toBe(DEST)                       // written to a temp file first…
    expect(mockFs.rename).toHaveBeenCalledWith(tmpPath, DEST)  // …then renamed over the destination
    return contents
  }

  it('writes the subscription document this run was given, and nothing else', async () => {
    const oauthJson = JSON.stringify({ claudeAiOauth: { accessToken: 'ada-token', expiresAt: 5_000 } })

    await writeRunCredential(HOME, { kind: 'subscription', provider: 'anthropic', oauthJson, grantId: 'grant-1', loginId: 'login-1' })

    expect(writtenDocument()).toBe(oauthJson)
  })

  /**
   * The failure this rules out is the one that kept the refresh report unwired
   * while the only home a run had was shared: a document that is not this
   * run's must never end up in the home this run reads back from. Two runs for
   * two different people write to two different homes, and each home holds
   * only its own owner's document.
   */
  it('a second person\'s run writes to their own home — neither document reaches the other', async () => {
    const adaHome = runnerClaudeHome(ADA_RW)
    const bobHome = runnerClaudeHome({ scope: 'storage', ownerType: 'user', ownerId: 'user-bob', mode: 'rw', runner: { kind: 'person', userId: 'user-bob' } })
    expect(adaHome).not.toBe(bobHome)

    await writeRunCredential(adaHome, {
      kind: 'subscription', provider: 'anthropic',
      oauthJson: JSON.stringify({ claudeAiOauth: { accessToken: 'ada-token', expiresAt: 5_000 } }),
      grantId: 'grant-1', loginId: 'login-1',
    })
    await writeRunCredential(bobHome, {
      kind: 'subscription', provider: 'anthropic',
      oauthJson: JSON.stringify({ claudeAiOauth: { accessToken: 'bob-token', expiresAt: 5_000 } }),
      grantId: 'grant-1', loginId: 'login-1',
    })

    const landed = mockFs.rename.mock.calls.map((c, i) => ({
      dest: String(c[1]),
      contents: String((mockFs.writeFile.mock.calls[i] as unknown as [string, string])[1]),
    }))
    expect(landed).toEqual([
      { dest: `${adaHome}/.credentials.json`, contents: expect.stringContaining('ada-token') },
      { dest: `${bobHome}/.credentials.json`, contents: expect.stringContaining('bob-token') },
    ])
    expect(landed[0].contents).not.toContain('bob-token')
    expect(landed[1].contents).not.toContain('ada-token')
  })

  it('writes no file for an API key — it reaches the run as an environment variable', async () => {
    await writeRunCredential(HOME, { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-test' })

    expect(mockFs.writeFile).not.toHaveBeenCalled()
    // The home itself is still created: docker would otherwise create the bind
    // source root-owned, and the run could not write into its own Claude home.
    expect(mockFs.mkdir).toHaveBeenCalledWith(HOME, { recursive: true })
  })

  it('writes no file when the run was given no credential at all', async () => {
    await writeRunCredential(HOME, null)

    expect(mockFs.writeFile).not.toHaveBeenCalled()
  })

  /**
   * Write or clear, never write or leave. The home outlives the run that
   * filled it and is bound read-write into every later run in the same
   * boundary, so a run that writes nothing would inherit whatever the last one
   * left. The case that makes it a defect: a person deletes their
   * subscription, hq stops handing it out, and their document is still sitting
   * at the path the next run authenticates from — hq revoked and the disk did
   * not.
   */
  it('a run granted no subscription finds no document left by the previous one', async () => {
    for (const credential of [{ kind: 'apiKey' as const, provider: 'anthropic' as const, apiKey: 'sk-test' }, null]) {
      mockFs.rm.mockClear()

      await writeRunCredential(HOME, credential)

      expect(mockFs.rm).toHaveBeenCalledWith(DEST, { force: true })
    }
  })

  it('a subscription run does not clear — it replaces', async () => {
    await writeRunCredential(HOME, {
      kind: 'subscription', provider: 'anthropic',
      oauthJson: JSON.stringify({ claudeAiOauth: { expiresAt: 5_000 } }),
      grantId: 'grant-1', loginId: 'login-1',
    })

    expect(mockFs.rm).not.toHaveBeenCalled()
  })

  it("does not hide a home it could not create — that failure is the run's to see", async () => {
    // The comment on the mkdir says docker would create a missing bind source
    // root-owned and the run could not then write into its own Claude home.
    // Swallowing the error is exactly how that resurfaces as an unexplained
    // permission failure inside somebody's container.
    mockFs.mkdir.mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }))

    await expect(writeRunCredential(HOME, null)).rejects.toThrow(/EACCES/)
  })

  it('takes the document away on request, and treats an absent one as done', async () => {
    await clearRunCredential(HOME)

    expect(mockFs.rm).toHaveBeenCalledWith(DEST, { force: true })
  })

  // R-116: a refreshed token that never reached hq is the only copy left.
  it('spares a document whose refreshed token never reached hq, once', async () => {
    holdUnreportedCredential(HOME)

    await clearRunCredential(HOME)
    expect(mockFs.rm).not.toHaveBeenCalled()

    await clearRunCredential(HOME)
    expect(mockFs.rm).toHaveBeenCalledWith(DEST, { force: true })
  })

  it('spares only the home it was recorded for', async () => {
    holdUnreportedCredential('/site/homes/user-someone-else')

    await clearRunCredential(HOME)

    expect(mockFs.rm).toHaveBeenCalledWith(DEST, { force: true })
    await clearRunCredential('/site/homes/user-someone-else')  // consume the hold
  })

  it('never spares a document from a run granted no subscription, and forgets the hold', async () => {
    holdUnreportedCredential(HOME)

    await writeRunCredential(HOME, null)
    expect(mockFs.rm).toHaveBeenCalledWith(DEST, { force: true })

    mockFs.rm.mockClear()
    await clearRunCredential(HOME)
    expect(mockFs.rm).toHaveBeenCalledWith(DEST, { force: true })
  })

  it('does not clobber a token the container refreshed in place — freshest wins', async () => {
    // A refresh carries both tokens; a document without them is not taken as one.
    mockFs.readFile.mockResolvedValue(JSON.stringify({ claudeAiOauth: { accessToken: 'at', refreshToken: 'rt', expiresAt: 9_000 } }) as any)

    await writeRunCredential(HOME, {
      kind: 'subscription', provider: 'anthropic',
      oauthJson: JSON.stringify({ claudeAiOauth: { expiresAt: 5_000 } }),
      grantId: 'grant-1', loginId: 'login-1',
    })

    expect(mockFs.writeFile).not.toHaveBeenCalled()
  })

  it('writes a strictly fresher document over a staler one', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify({ claudeAiOauth: { expiresAt: 5_000 } }) as any)
    const oauthJson = JSON.stringify({ claudeAiOauth: { expiresAt: 9_000 } })

    await writeRunCredential(HOME, { kind: 'subscription', provider: 'anthropic', oauthJson, grantId: 'grant-1', loginId: 'login-1' })

    expect(writtenDocument()).toBe(oauthJson)
  })

  it('writes into an empty home even when the document carries no parseable expiry', async () => {
    // Absent (null) is distinct from present-but-unparseable (0): a first run
    // must never be left with nothing to authenticate with.
    await writeRunCredential(HOME, { kind: 'subscription', provider: 'anthropic', oauthJson: 'not valid json {', grantId: 'grant-1', loginId: 'login-1' })

    expect(writtenDocument()).toBe('not valid json {')
  })
})
