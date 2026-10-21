import { describe, it, expect, vi, beforeEach } from 'vitest'

// hq's `status` and `default-site-cause` on hq's machine: the facts as data, the words as sentences.

const db = vi.hoisted(() => ({ users: 3, site: null as null | { status: string; health: unknown; lastSeenAt: Date | null } }))
vi.mock('wasp/server', () => ({
  prisma: {
    user: { count: async () => db.users },
    executionSite: { findFirst: async () => db.site },
  },
}))

import { runHqMachineCommand } from '../hqMachineCommands'
import { __resetDefaultSiteCauseForTests } from '../../../sites/defaultSiteCause'
import { __resetActiveRunsForTests, trackRunStatus } from '../../../sites/activeRuns'

const SECRET = 'p'.repeat(64)

beforeEach(() => {
  vi.stubEnv('HQ_PAIRING_SECRET', SECRET)
  vi.stubEnv('WASP_WEB_CLIENT_URL', 'https://hq.example.com')
  db.users = 3
  db.site = { status: 'OFFLINE', health: null, lastSeenAt: new Date(Date.now() - 60_000) }
  __resetDefaultSiteCauseForTests()
  __resetActiveRunsForTests()
})

describe('status', () => {
  it('counts the agents working and says so in a sentence', async () => {
    trackRunStatus({ runId: 'r1', sessionId: 's1', status: 'RUNNING' }, 'site-a')
    trackRunStatus({ runId: 'r2', sessionId: 's2', status: 'RUNNING' }, 'site-a')
    const result = await runHqMachineCommand('status', [])
    expect(result).toMatchObject({ ok: true, data: { users: 3, runningAgents: 2 } })
    expect((result as { text: string }).text).toContain('3 people have accounts; 2 agents are working.')
  })

  it('names why its own site is not connected once hq\'s machine has said, and never an internal word', async () => {
    expect(await runHqMachineCommand('default-site-cause', ['credentialRefused'])).toMatchObject({ ok: true, data: { cause: 'credentialRefused' } })
    const result = await runHqMachineCommand('status', [])
    expect(result).toMatchObject({ ok: true, data: { hqSite: { state: 'notConnected', cause: 'credentialRefused' } } })
    const text = (result as { text: string }).text
    expect(text).toContain("HQ's site is not connected. HQ refused it: its pairing secret is not the one HQ expects.")
    expect(text).not.toMatch(/notConnected|unpaired|credentialRefused/)
  })

  it('says why is not known before hq\'s machine has said', async () => {
    const text = ((await runHqMachineCommand('status', [])) as { text: string }).text
    expect(text).toContain("HQ's site is not connected, and why is not known yet.")
  })

  it('says it is connected while it is, whatever cause was reported before', async () => {
    await runHqMachineCommand('default-site-cause', ['unreachable'])
    db.site = { status: 'ONLINE', health: null, lastSeenAt: new Date() }
    const result = await runHqMachineCommand('status', [])
    expect(result).toMatchObject({ data: { hqSite: { state: 'connected', cause: null } } })
    expect((result as { text: string }).text).toContain("HQ's site is connected.")
  })
})

describe('default-site-cause', () => {
  it('refuses a cause hq does not know, or none given, keeping nothing', async () => {
    expect(await runHqMachineCommand('default-site-cause', ['<script>'])).toMatchObject({ ok: false, code: 'usage' })
    expect(await runHqMachineCommand('default-site-cause', [])).toMatchObject({ ok: false, code: 'usage' })
    expect(await runHqMachineCommand('status', [])).toMatchObject({ data: { hqSite: { cause: null } } })
  })

  it('clears with none', async () => {
    await runHqMachineCommand('default-site-cause', ['unreachable'])
    expect(await runHqMachineCommand('default-site-cause', ['none'])).toMatchObject({ ok: true, data: { cause: 'none' } })
    expect(await runHqMachineCommand('status', [])).toMatchObject({ data: { hqSite: { cause: null } } })
  })

  it('says what kind of refusal an unknown command is, as data', async () => {
    expect(await runHqMachineCommand('drop-database', [])).toMatchObject({ ok: false, code: 'unknown' })
  })
})
