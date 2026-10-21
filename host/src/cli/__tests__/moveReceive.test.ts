import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { ownerHandler } from '../../owner/dispatch'
import { writePin } from '../../link/pin'
import { writeReceive, type ReceiveRecord } from '../../move/record'
import { moveEndedHeard } from '../../move/receive'
import { FakeConsole, FakeRelay } from '../../link/__tests__/fakeRelay'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'

/** The machine armed to receive a move, when the move ends before it came: `console connect` and `status` say so. */
let m: FakeMachine
let out: string

const io: Io = { out: t => { out += `${t}\n` }, write: t => { out += t }, err: t => { out += `${t}\n` }, ask: async () => null }

beforeEach(() => {
  m = fakeMachine()
  out = ''
  m.ctx.link = { start: () => {}, stop: () => {}, connected: () => true, sendEnvelope: () => {} }
})
afterEach(() => m.cleanup())

const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0', () => new Date('2026-10-14T09:00:00Z'))
const flat = (s: string) => s.replace(/\s+/g, ' ')

async function armed(phase: ReceiveRecord['phase'], reason: string | null = null): Promise<void> {
  const fleetConsole = await FakeConsole.make()
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
  })
  writeReceive(m.ctx.state, {
    transferId: 't1', peer: 'p', peerIdentity: fleetConsole.keys.identity as never, siteName: 'machine-a', peerName: 'machine-a', phase,
    armedAt: m.ctx.now().toISOString(), deadline: null, reason,
  })
}

describe('console connect, on the machine a site was to move to @SC-845', () => {
  it('says the move did not happen, and why, when it ended before it came', async () => {
    const relay = new FakeRelay()
    const fleetConsole = await FakeConsole.make()
    m.ctx.dial = relay.dial
    relay.onJoin = async (join, conn) => {
      await conn.deliver('host.joined', { hostId: 'h1', machineCredential: 'hmc_4f1c2a9e7b3d5e8f0a1b', acceptance: await fleetConsole.acceptance('7KQ4M2XD46Q3', join.identity) })
      writeReceive(m.ctx.state, {
        transferId: 't1', peer: 'p', peerIdentity: fleetConsole.keys.identity as never, siteName: 'machine-a', peerName: 'machine-a', phase: 'waiting',
        armedAt: m.ctx.now().toISOString(), deadline: null, reason: null,
      })
      // The old machine refused while this one waits; the Fleet Console says why.
      const sleep = m.ctx.sleep
      m.ctx.sleep = async ms => {
        moveEndedHeard(m.ctx, { kind: 'moveEnded', transferId: 't1', reason: 'The site on machine-a has moved already.' })
        return sleep(ms)
      }
    }
    await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3')
    expect(out).toMatch(/Receiving the site machine-a from machine-a \.+ did not happen/)
    expect(flat(out)).toContain('The site machine-a did not move here from machine-a. The site on machine-a has moved already. Nothing of it is on this machine, and it is ready for another move.')
    expect(flat(out)).not.toContain('is moving here')
  })

  it('says a move that had already ended did not happen, not that the site has not started', async () => {
    const relay = new FakeRelay()
    const fleetConsole = await FakeConsole.make()
    m.ctx.dial = relay.dial
    relay.onJoin = async (join, conn) => {
      await conn.deliver('host.joined', { hostId: 'h1', machineCredential: 'hmc_4f1c2a9e7b3d5e8f0a1b', acceptance: await fleetConsole.acceptance('7KQ4M2XD46Q3', join.identity) })
      writeReceive(m.ctx.state, {
        transferId: 't1', peer: 'p', peerIdentity: fleetConsole.keys.identity as never, siteName: 'machine-a', peerName: 'machine-a', phase: 'failed',
        armedAt: m.ctx.now().toISOString(), deadline: null, reason: 'the site on machine-a has moved already.',
      })
    }
    await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3')
    expect(out).toMatch(/Receiving the site machine-a from machine-a \.+ did not happen/)
    expect(flat(out)).toContain('did not move here from machine-a. The site on machine-a has moved already.')
    expect(flat(out)).not.toContain('has not started the site here yet')
  })

})

describe('agenthix status, on the machine a site was to move to @SC-858', () => {
  it('says it waits to receive the site', async () => {
    await armed('waiting')
    await cli('status')
    expect(flat(out)).toContain('Waiting to receive the site machine-a from machine-a; it starts nothing of its own meanwhile.')
  })

  it('says the move did not happen, why, and that the machine is ready for another', async () => {
    await armed('failed', 'The site on machine-a has moved already.')
    await cli('status')
    expect(flat(out)).toContain('The site machine-a did not move here from machine-a. The site on machine-a has moved already. Nothing of it is on this machine, and it is ready for another move.')
    expect(flat(out)).not.toContain('Waiting to receive')
  })

  it('says nothing of an ended move once the machine carries a site of its own', async () => {
    await armed('failed', 'The site on machine-a has moved already.')
    m.ctx.state.writeJson(['site', 'settings.json'], { name: 'its own', version: '0.2.0', images: {}, hqUrl: 'https://hq.acme.example', installedAt: 'x' })
    await cli('status')
    expect(flat(out)).not.toContain('did not move here')
  })
})
