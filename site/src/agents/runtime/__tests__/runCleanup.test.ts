/**
 * A run's credential leaves the
 * Claude home only when the LAST run using that home ends. Runs in one home are
 * no longer queued behind each other, so the first of two to finish must not
 * take the document away from the one still working.
 *
 * Real files in a temporary home and the real credential functions, so what is
 * asserted is whether the document is on disk — not whether a function was
 * called. Only the container manager, whose own end-of-run rules are covered in
 * containerRuns.test.ts, is stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const h = vi.hoisted(() => ({
  markRunEnd: vi.fn((_name: string) => {}),
  hqState: 'connected' as string,
  sendEvent: vi.fn(),
}))

vi.mock('../AgentContainerManager', () => ({ agentContainerManager: { markRunEnd: h.markRunEnd } }))
vi.mock('../../../server/hq/hqConnection', () => ({
  hqConnectionManager: { sendEvent: h.sendEvent, connectionState: () => h.hqState },
}))
vi.mock('../../../server/utils/logger', () => ({
  Logger: vi.fn().mockImplementation(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() })),
}))
vi.mock('../boundaryClaudeHome', async () => {
  const actual = await vi.importActual<typeof import('../boundaryClaudeHome')>('../boundaryClaudeHome')
  return { ...actual, clearRunCredential: vi.fn(actual.clearRunCredential) }
})

import { createRunLaunchSink, releaseRunResources } from '../runCleanup'
import { clearRunCredential, writeRunCredential } from '../boundaryClaudeHome'
import { credentialHomeInUse, serialiseCredentialHome } from '../agentCredentials'
import type { RunLaunchSink } from '../runLaunch'
import { writePinnedMemory } from '../pinnedMemoryFiles'

const document = (expiresAt: number) => JSON.stringify({ claudeAiOauth: { accessToken: 't', expiresAt } })
const SUBSCRIPTION = { kind: 'subscription' as const, provider: 'anthropic' as const, oauthJson: document(5_000), grantId: 'grant-1', loginId: 'login-1' }

let root: string
let home: string
const credentialFile = () => path.join(home, '.credentials.json')
const exists = (p: string) => fs.access(p).then(() => true, () => false)

/** A run as far as the launch takes it: its home named on the sink, then its credential written. */
async function arrive(): Promise<RunLaunchSink> {
  const sink = createRunLaunchSink()
  sink.claudeHome = home
  await writeRunCredential(home, SUBSCRIPTION)
  sink.containerName = 'agent-container'
  return sink
}

beforeEach(async () => {
  vi.clearAllMocks()
  h.hqState = 'connected'
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'run-cleanup-'))
  home = path.join(root, 'home')
})

afterEach(async () => {
  delete process.env.AGENT_CONTAINER_ENDRUN_SECONDS
  await fs.rm(root, { recursive: true, force: true })
})

describe("a run's credential leaves the home with the last run using it", () => {
  it('is removed when the only run in the home ends', async () => {
    const sink = await arrive()
    expect(await exists(credentialFile())).toBe(true)

    await releaseRunResources(sink, null)

    expect(await exists(credentialFile())).toBe(false)
    expect(credentialHomeInUse(home)).toBe(false)
  })

  it('stays while another run in the home is still going, and goes with the last', async () => {
    const a = await arrive()
    const b = await arrive()

    await releaseRunResources(a, null)
    expect(await exists(credentialFile())).toBe(true)

    await releaseRunResources(b, null)
    expect(await exists(credentialFile())).toBe(false)
  })

  it('is not taken away by a run arriving with no subscription while another run uses it', async () => {
    const first = await arrive()
    const second = createRunLaunchSink()
    second.claudeHome = home
    await writeRunCredential(home, { kind: 'apiKey', provider: 'anthropic', apiKey: 'k' } as never)

    expect(await exists(credentialFile())).toBe(true)

    await releaseRunResources(second, null)
    await releaseRunResources(first, null)
    expect(await exists(credentialFile())).toBe(false)
  })

  it('is taken away by a run arriving with no subscription when the home is otherwise unused', async () => {
    await writeRunCredential(home, SUBSCRIPTION)
    const sink = createRunLaunchSink()
    sink.claudeHome = home
    await writeRunCredential(home, { kind: 'apiKey', provider: 'anthropic', apiKey: 'k' } as never)

    expect(await exists(credentialFile())).toBe(false)
    await releaseRunResources(sink, null)
  })

  it('stays for a run that has named its home but not yet written its credential', async () => {
    // Two runs starting at once: B's launch has named the home and is on its
    // way to the write while A — already running — ends. A must not remove
    // the document B is about to rely on.
    const a = await arrive()
    const b = createRunLaunchSink()
    b.claudeHome = home

    await releaseRunResources(a, null)
    expect(await exists(credentialFile())).toBe(true)

    await writeRunCredential(home, SUBSCRIPTION)
    await releaseRunResources(b, null)
    expect(await exists(credentialFile())).toBe(false)
  })

  it('is not removed by a removal that was decided before another run arrived', async () => {
    // A was the last out and its removal is queued, but B arrives before that
    // removal's turn comes. Held on the home's own operation queue so the
    // interleaving is certain rather than a matter of timing.
    // A's write goes through the same queue, so A arrives before it is held.
    const a = await arrive()
    let release!: () => void
    const blocker = serialiseCredentialHome(home, () => new Promise<void>(r => { release = r }))
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))

    const ending = releaseRunResources(a, null)
    const b = createRunLaunchSink()
    b.claudeHome = home
    release()
    await blocker
    await ending

    expect(vi.mocked(clearRunCredential)).not.toHaveBeenCalled()
    expect(await exists(credentialFile())).toBe(true)
    await releaseRunResources(b, null)
    expect(await exists(credentialFile())).toBe(false)
  })

  it('a run that ended before it named a home neither removes the document nor leaves a count behind', async () => {
    const running = await arrive()
    const failedEarly = createRunLaunchSink()   // failed at capability verification, say

    await releaseRunResources(failedEarly, null)
    expect(await exists(credentialFile())).toBe(true)

    await releaseRunResources(running, null)
    expect(await exists(credentialFile())).toBe(false)
  })

  it('a run that failed before its container was ready leaves the document to the run still going', async () => {
    // It named the home — and may have written into it — but never got a
    // container name, so it takes the no-container path out.
    const running = await arrive()
    const failed = await arrive()
    failed.containerName = null

    await releaseRunResources(failed, null)
    expect(h.markRunEnd).toHaveBeenCalledTimes(0)
    expect(await exists(credentialFile())).toBe(true)

    await releaseRunResources(running, null)
    expect(await exists(credentialFile())).toBe(false)
  })

  it('ends the run in its container', async () => {
    const sink = await arrive()

    await releaseRunResources(sink, null)

    expect(h.markRunEnd).toHaveBeenCalledWith('agent-container')
  })

  it('never fails a run because the document could not be removed', async () => {
    vi.mocked(clearRunCredential).mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }))
    const sink = await arrive()

    await expect(releaseRunResources(sink, null)).resolves.toBeUndefined()
  })

  it('gives up on a removal that hangs, and frees the home for the next one', async () => {
    process.env.AGENT_CONTAINER_ENDRUN_SECONDS = '0.05'
    vi.mocked(clearRunCredential).mockImplementationOnce(() => new Promise(() => { /* never settles */ }))
    const first = await arrive()
    await expect(releaseRunResources(first, null)).resolves.toBeUndefined()

    const second = await arrive()
    await releaseRunResources(second, null)
    expect(await exists(credentialFile())).toBe(false)
  })
})

describe("a run's pinned memory leaves run staging when the run ends", () => {
  it('is removed by the end of the run that wrote it, on every exit path', async () => {
    const claudeDir = path.join(home, '.claude')
    const staging = path.join(home, 'run-staging')
    const sink = createRunLaunchSink()
    sink.claudeHome = claudeDir
    sink.pinnedMemory = { staging, sessionId: 'sess1' }
    await writePinnedMemory({ serverDir: staging, visibleDir: '/run/staging', shared: false }, 'sess1', [
      { key: 'diet', scope: 'person', title: 'Vegetarian', body: 'Eats no meat.' },
    ])
    const folder = path.join(staging, 'pinned-memory', 'sess1')
    expect(await exists(path.join(folder, 'pinned.md'))).toBe(true)

    await releaseRunResources(sink, null)

    expect(await exists(folder)).toBe(false)
  })
})
