/** The connection to Cloud from hq's machine (`agenthix cloud connect|disconnect`), over hq's control socket. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  runByCloud: false,
  calls: [] as unknown[][],
  state: { connection: null, connecting: null, lastAttempt: null } as Record<string, unknown>,
}))
vi.mock('..', () => ({
  runByCloud: () => h.runByCloud,
  cloudConnection: () => ({
    state: async () => h.state,
    connect: async (by: string | null) => { h.calls.push(['connect', by]); return { userCode: 'WDJB-MJHT', verificationUri: 'https://cloud.test/connect' } },
    disconnect: async (by: string | null) => { h.calls.push(['disconnect', by]); return true },
  }),
}))

import { cloudConnectionCommand } from '../machineCommands'

beforeEach(() => { h.runByCloud = false; h.calls.length = 0 })

describe('the connection from hq\'s machine @SC-1126', () => {
  it('connects and disconnects as hq\'s machine admin, and reads the state with whether Cloud runs it', async () => {
    expect(await cloudConnectionCommand(['state'])).toMatchObject({ ok: true, data: { connection: null, runByCloud: false } })
    expect(await cloudConnectionCommand(['connect'])).toMatchObject({ ok: true, data: { connecting: { userCode: 'WDJB-MJHT' } } })
    expect(await cloudConnectionCommand(['disconnect'])).toMatchObject({ ok: true, data: { disconnected: true } })
    expect(h.calls).toEqual([['connect', null], ['disconnect', null]])
  })

  it('refuses to disconnect where Cloud runs hq, and words it does not read', async () => {
    h.runByCloud = true
    expect(await cloudConnectionCommand(['disconnect'])).toMatchObject({ ok: false, code: 'conflict' })
    expect(await cloudConnectionCommand(['approve'])).toMatchObject({ ok: false, code: 'usage' })
    expect(await cloudConnectionCommand(['state', 'more'])).toMatchObject({ ok: false, code: 'usage' })
    expect(h.calls).toEqual([])
  })
})
