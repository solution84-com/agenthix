import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('../credentialFile', () => import('./fakeCredentialFile'))
vi.mock('../homeFolder', () => import('./fakeHomeFolder'))
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn().mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })),
  },
}))

vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}))

// Mocked at the module boundary (matching AgentContainerManager.test.ts's own
// approach) rather than pulling hqConnection.ts's real transitive chain (ws,
// the Prisma client, the channel registry) into this file.
vi.mock('../../../server/hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: vi.fn() },
}))

import { checkAgentCredentials } from '../agentCredentials'
import type { ContainerKey } from '../containerTypes'
import { hqConnectionManager } from '../../../server/hq/hqConnection'
import fs from 'node:fs/promises'
const { execFile } = await import('node:child_process')
const mockExecFile = vi.mocked(execFile)
const mockFs = vi.mocked(fs)
const mockSendEvent = vi.mocked(hqConnectionManager.sendEvent)

// The boundary's Claude home, the one a run's container binds. The per-agent
// home this used to read — and the shared operator login that seeded it — are
// gone; the freshest-wins pair that arbitrated between them went with them, so
// its own tests are gone too. What this file still covers is the half that
// survived: the in-container probe, and the dead-grant report to hq.
const HOME = '/site/homes/project-proj-alpha'
const PROJECT_KEY: ContainerKey = { scope: 'storage', ownerType: 'project', ownerId: 'proj-alpha', mode: 'rw', runner: { kind: 'project', projectId: 'proj-alpha' } }
const SUBSCRIPTION = { kind: 'subscription' as const, provider: 'anthropic' as const, oauthJson: '{"claudeAiOauth":{}}', grantId: 'grant-1', loginId: 'login-1' }

/** The common shape: a Claude SDK run in a project's boundary. Only a Claude
 *  SDK run probes at all, so that is the default here; the native case is
 *  covered on its own below. */
function check(over: Partial<Parameters<typeof checkAgentCredentials>[0]> = {}) {
  return checkAgentCredentials({
    home: HOME,
    key: PROJECT_KEY,
    containerName: 'container-1',
    credential: null,
    agentHandle: 'coder',
    runtime: 'claude-sdk',
    ...over,
  })
}

/** Wires fs.readFile to answer with a given expiresAt per path — undefined means ENOENT. */
function mockCredentialFiles(entries: Record<string, number | undefined>) {
  mockFs.readFile.mockImplementation((async (filePath: string) => {
    const expiresAt = entries[filePath]
    if (expiresAt === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return JSON.stringify({ claudeAiOauth: { expiresAt } })
  }) as any)
}

function mockDockerExec(succeeds: boolean) {
  mockExecFile.mockImplementation(((_cmd: any, _args: any, cb: any) => {
    if (succeeds) cb(null, '', '')
    else cb(Object.assign(new Error('exit code 1'), { code: 1 }), '', '')
  }) as any)
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.SITE_ROOT = '/site'
  mockFs.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
})

describe('checkAgentCredentials — dead-grant detection @SC-349', () => {
  it('skips every check when an LLM API key is configured', async () => {
    await check({ containerName: 'container-1', agentHandle: 'bot', credential: { kind: 'apiKey', provider: 'anthropic', apiKey: 'sk-api-key' } })

    expect(mockExecFile).not.toHaveBeenCalled()
    expect(mockSendEvent).not.toHaveBeenCalled()
  })

  it('missing credentials file: throws the remediation error AND sends exactly one health event', async () => {
    mockDockerExec(false)
    const call = () => check({ containerName: 'container-1', agentHandle: 'missing-agent-1', credential: null })

    await expect(call()).rejects.toThrow(/OAuth credentials not found/)
    expect(mockSendEvent).toHaveBeenCalledTimes(1)
    expect(mockSendEvent).toHaveBeenCalledWith('site.credentialHealth', {
      agentHandle: 'missing-agent-1',
      state: 'missing',
      detail: expect.any(String),
    })

    // Second call within the hour: still throws (the throw is un-throttled),
    // but sends NO additional health event.
    await expect(call()).rejects.toThrow(/OAuth credentials not found/)
    expect(mockSendEvent).toHaveBeenCalledTimes(1)
  })

  it('expired credentials file: throws the remediation error AND sends exactly one health event', async () => {
    mockDockerExec(true)
    mockCredentialFiles({ [`${HOME}/.credentials.json`]: Date.now() - 60_000 }) // expired one minute ago
    const call = () => check({ containerName: 'container-2', agentHandle: 'expired-agent-1', credential: null })

    await expect(call()).rejects.toThrow(/OAuth credentials expired/)
    expect(mockSendEvent).toHaveBeenCalledTimes(1)
    expect(mockSendEvent).toHaveBeenCalledWith('site.credentialHealth', {
      agentHandle: 'expired-agent-1',
      state: 'expired',
      detail: expect.any(String),
    })

    // Second call within the hour: still throws, but no additional event.
    await expect(call()).rejects.toThrow(/OAuth credentials expired/)
    expect(mockSendEvent).toHaveBeenCalledTimes(1)
  })

  it('a present, non-expired credentials file passes without throwing or sending an event', async () => {
    mockDockerExec(true)
    mockCredentialFiles({ [`${HOME}/.credentials.json`]: Date.now() + 60 * 60_000 })

    await expect(check({ containerName: 'container-3', agentHandle: 'healthy-agent-1', credential: null })).resolves.toBeUndefined()
    expect(mockSendEvent).not.toHaveBeenCalled()
  })

  it('reads the expiry from the BOUNDARY home it was given, not from any agent-keyed path', async () => {
    mockDockerExec(true)
    mockCredentialFiles({ [`${HOME}/.credentials.json`]: Date.now() + 60 * 60_000 })

    await check({ containerName: 'container-3b', agentHandle: 'coder', credential: null })

    const readPaths = mockFs.readFile.mock.calls.map(c => String(c[0]))
    expect(readPaths).toEqual([`${HOME}/.credentials.json`])
    expect(readPaths.some(p => p.includes('/agents/'))).toBe(false)
  })
})

/**
 * The run's credential is a tagged union (spec §6.3), so what this function
 * asks is no longer "is a key string non-empty" but "does this run need OAuth
 * files at all". Only an API key answers no. A subscription login IS an OAuth
 * document, so its run needs one present and unexpired exactly as a run with
 * no credential of its own does — skipping the probe for it would let a run
 * start against an expired login and fail inside the SDK instead, where the
 * person is told nothing useful.
 */
describe('checkAgentCredentials asks whether the run needs OAuth files, not whether a key is set', () => {
  it('a subscription credential still probes, and still surfaces a missing grant', async () => {
    mockDockerExec(false)

    await expect(check({ containerName: 'container-4', agentHandle: 'sub-agent-1', credential: SUBSCRIPTION })).rejects.toThrow(/OAuth credentials not found/)
    expect(mockExecFile).toHaveBeenCalled()
  })

  it('a subscription whose access token has expired passes when it can be renewed, so Claude Code renews it', async () => {
    mockDockerExec(true)
    mockFs.readFile.mockImplementation((async () =>
      JSON.stringify({ claudeAiOauth: { expiresAt: Date.now() - 8 * 60 * 60_000, refreshToken: 'r' } })) as any)

    await expect(check({ containerName: 'container-7', agentHandle: 'sub-agent-3', credential: SUBSCRIPTION })).resolves.toBeUndefined()
    expect(mockSendEvent).not.toHaveBeenCalled()
  })

  it('a subscription whose access token has expired is refused when it has nothing to renew from', async () => {
    mockDockerExec(true)
    mockFs.readFile.mockImplementation((async () =>
      JSON.stringify({ claudeAiOauth: { expiresAt: Date.now() - 60_000, refreshToken: '' } })) as any)

    await expect(check({ containerName: 'container-8', agentHandle: 'sub-agent-4', credential: SUBSCRIPTION })).rejects.toThrow(/OAuth credentials expired/)
  })

  it('a subscription credential with a live grant passes, the same as any other OAuth run', async () => {
    mockDockerExec(true)
    mockCredentialFiles({ [`${HOME}/.credentials.json`]: Date.now() + 60 * 60_000 })

    await expect(check({ containerName: 'container-5', agentHandle: 'sub-agent-2', credential: SUBSCRIPTION })).resolves.toBeUndefined()
    expect(mockSendEvent).not.toHaveBeenCalled()
  })
})

/**
 * The old remediation told whoever read the failed run to `docker run ... claude
 * login` against the site's shared operator login. That was wrong for a person
 * whose own subscription was meant to be used — it repairs the OPERATOR's
 * account, not theirs — and, once the credential arrives per run, wrong a second
 * time: the person reading the failure is not on the execution machine and
 * cannot run it at all.
 */
describe('the remediation matches what actually went wrong', () => {
  async function failureFor(
    credential: Parameters<typeof checkAgentCredentials>[0]['credential'],
    key: ContainerKey = PROJECT_KEY,
  ) {
    mockDockerExec(false)
    return await check({ containerName: 'container-6', credential, key })
      .then(() => null, (err: Error) => err.message)
  }

  it('never names a docker command or the site\'s shared login, whatever the credential', async () => {
    for (const credential of [null, SUBSCRIPTION]) {
      const message = await failureFor(credential)
      expect(message).not.toContain('docker run')
      expect(message).not.toContain('claude login')
      expect(message).not.toContain('secrets/.claude')
    }
  })

  it('tells a subscription run to sign in to its own subscription again', async () => {
    const message = await failureFor(SUBSCRIPTION)
    expect(message).toContain('subscription login this run was given')
    expect(message).toContain('sign in to your subscription again')
  })

  it('tells a run with no credential at all that it was given none, and where one comes from', async () => {
    const message = await failureFor(null)
    expect(message).toContain('no model credential of its own')
    expect(message).toContain('Add an API key for the project it acts for')
  })

  it("names the person when the run acts in a person's own storage", async () => {
    const message = await failureFor(null, { scope: 'storage', ownerType: 'user', ownerId: 'u1', mode: 'rw', runner: { kind: 'person', userId: 'u1' } })
    expect(message).toContain('Add an API key for the person it acts for')
  })
})

/**
 * Only a Claude SDK run authenticates from Claude Code's own OAuth document.
 * The native runtime reaches its providers through their own environment keys
 * and makes its own narrower check, so asking it for a document it never reads
 * refuses runs that work. It used to pass by accident on an upgraded install,
 * where the site's shared operator login had been copied into every agent's
 * home; nothing is copied anywhere now, so the accident became a refusal.
 */
describe('only a Claude SDK run is asked for OAuth files', () => {
  it('a native run with no credential does not probe, and does not fail', async () => {
    mockDockerExec(false)

    await expect(check({ runtime: 'opencode' })).resolves.toBeUndefined()
    expect(mockExecFile).not.toHaveBeenCalled()
    expect(mockSendEvent).not.toHaveBeenCalled()
  })

  it('a native run whose home holds a long-expired document is still not failed', async () => {
    mockDockerExec(true)
    mockCredentialFiles({ [`${HOME}/.credentials.json`]: Date.now() - 60_000 })

    await expect(check({ runtime: 'opencode' })).resolves.toBeUndefined()
  })

  it('the same run under the SDK runtime DOES fail — the gate is the runtime, not the mock', async () => {
    mockDockerExec(false)

    await expect(check()).rejects.toThrow(/OAuth credentials not found/)
  })
})
