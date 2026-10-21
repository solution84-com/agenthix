/**
 * hq read-only for the whole of its move (spec §13), though hq keeps the mode in memory only: an hq that starts again
 * during the move — on either machine — is made read-only again by the host service, until the move ends, and never
 * after it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fromBase64url } from '@agenthix/core/host-crypto'
import type { FakeMachine } from '../../__tests__/fakeMachine'
import { readReceive, readSend } from '../record'
import { until } from './twoMachines'
import { hqMachines, type HqTwo } from './hqMachines'

let two: HqTwo
beforeEach(async () => {
  two = await hqMachines()
})
afterEach(() => two.cleanup())

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** hq's read-only mode on a machine, as hq holds it: in memory, so a restart clears it. */
function readOnlyOf(m: FakeMachine): { on: boolean; restart: () => void } {
  const mode = { on: false, restart: () => { mode.on = false } }
  const run = m.ctx.hqControl.run.bind(m.ctx.hqControl)
  m.ctx.hqControl.run = async (command, args = []) => {
    if (command === 'read-only' && args[0] === 'on') mode.on = true
    if (command === 'read-only' && args[0] === 'off') mode.on = false
    return run(command, args)
  }
  return mode
}

const lastReadOnly = (side: 'old' | 'new') => two.said[side].filter(c => c[0] === 'read-only').at(-1)

describe('an hq that starts again during its move @SC-859', () => {
  it('on the old machine, is read-only again before the backup is taken, and writable never', async () => {
    const hq = readOnlyOf(two.old)
    let duringBackup: boolean | null = null
    const start = two.old.ctx.backupIO.startServices.bind(two.old.ctx.backupIO)
    two.old.ctx.backupIO.startServices = async (project, file, services) => {
      if (duringBackup === null) {
        hq.restart()
        await pause(150)
        duringBackup = hq.on
      }
      return start(project, file, services)
    }
    await two.arm()
    await two.sendNow()
    await two.run()
    expect(readSend(two.old.ctx.state)?.phase).toBe('committed')
    expect(duringBackup).toBe(true)
  })

  it('on the new machine, is read-only again until the old machine commits, and then stays writable', async () => {
    const hq = readOnlyOf(two.fresh)
    let beforeCommit: boolean | null = null
    const run = two.fresh.ctx.hqControl.run.bind(two.fresh.ctx.hqControl)
    two.fresh.ctx.hqControl.run = async (command, args = []) => {
      if (command === 'transfer-open') {
        hq.restart()
        await pause(150)
        beforeCommit = hq.on
      }
      return run(command, args)
    }
    await two.arm()
    await two.sendNow()
    await two.run()
    await until(() => readReceive(two.fresh.ctx.state)?.phase === 'committed')
    expect(beforeCommit).toBe(true)
    await pause(100)
    expect(hq.on).toBe(false)
    expect(lastReadOnly('new')).toEqual(['read-only', 'off'])
  })

  it('is not made read-only again once a move that did not happen gave it back', async () => {
    two.hq.act = (from, type, payload) => {
      if (from !== 'old' || type !== 'transfer.chunk' || payload.seq !== 0) return payload
      const bytes = Buffer.from(fromBase64url(payload.data as string)!)
      bytes[bytes.length - 1] ^= 1
      return { ...payload, data: bytes.toString('base64url') }
    }
    const hq = readOnlyOf(two.old)
    await two.arm()
    await two.sendNow()
    await two.run()
    expect(readSend(two.old.ctx.state)?.phase).toBe('rolledBack')
    await pause(100)
    expect(hq.on).toBe(false)
    expect(lastReadOnly('old')).toEqual(['read-only', 'off'])
  })
})
