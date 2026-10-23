import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { ownerHandler } from '../../owner/dispatch'
import { install } from '../../install/install'
import { EnvelopeReplayGuard, signHandoverCertificate } from '@agenthix/core/host-crypto'
import type { HandoverCodeAnswer, HostEnvelope } from '@agenthix/core'
import { readPin, writePin } from '../../link/pin'
import { writeReceive } from '../../move/record'
import { envelopeHandler } from '../../link/envelopes'
import { handoverCodeUndeliverable } from '../../link/askCode'
import { followHandover } from '../../link/handover'
import { retireHandedOverConsole } from '../../link/localConsole'
import { hostKeys } from '../../identity/identity'
import { FakeConsole, FakeRelay } from '../../link/__tests__/fakeRelay'
import { parseCommand } from '../commands'
import { runCommand, type Io, type Send } from '../run'

let m: FakeMachine
let out: string
let err: string
let answers: (string | null)[]

const io: Io = {
  out: t => { out += `${t}\n` },
  write: t => { out += t },
  err: t => { err += `${t}\n` },
  ask: async () => (answers.length ? answers.shift()! : null),
}

beforeEach(() => {
  m = fakeMachine()
  out = ''
  err = ''
  answers = []
  m.ctx.link = { start: () => {}, stop: () => {}, connected: () => true, sendEnvelope: () => {} }
})
afterEach(() => m.cleanup())

const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0', () => new Date('2026-10-14T09:00:00Z'))
const flat = (s: string) => s.replace(/\s+/g, ' ')

async function pinned() {
  const fleetConsole = await FakeConsole.make()
  writePin(m.ctx.state, {
    console: fleetConsole.keys.identity as never, consoleFingerprint: fleetConsole.fingerprint, hqAddress: 'https://hq.acme.example',
    hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
  })
  return fleetConsole
}

describe('the Fleet Console’s commands', () => {
  it('reads them, and refuses what is not one before asking the host service', () => {
    expect(parseCommand(['console', 'connect', 'https://hq.acme.example', '7kq4-m2xd-46q3'])).toEqual({ kind: 'consoleConnect', address: 'https://hq.acme.example', code: '7kq4-m2xd-46q3' })
    expect(parseCommand(['console', 'connect', 'https://hq.acme.example', 'nope'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['console', 'connect', 'hq.acme.example', '7KQ4M2XD46Q3'])).toMatchObject({ kind: 'usage' })
    expect(parseCommand(['console', 'disconnect', '--yes'])).toEqual({ kind: 'consoleDisconnect', yes: true })
    expect(parseCommand(['console', 'install', 'https://hq.acme.example', '4HQW-N7TE-M9S3'])).toMatchObject({ kind: 'consoleInstall', yes: false })
    expect(parseCommand(['hq', 'console-code'])).toEqual({ kind: 'consoleCode', yes: false })
    expect(parseCommand(['hq', 'fleet-admin', 'avery', '--yes'])).toEqual({ kind: 'fleetAdmin', user: 'avery', yes: true })
    expect(parseCommand(['hq', 'fleet-admin'])).toMatchObject({ kind: 'usage' })
  })

  it('lists them in help', async () => {
    await cli('help')
    for (const usage of ['console connect <hq address> <code>', 'console disconnect', 'console install <hq address> <code>', 'hq console-code', 'hq fleet-admin [--remove] <user>']) {
      expect(out).toContain(usage)
    }
  })
})

describe('agenthix console connect @SC-845', () => {
  it('shows the machine and its fingerprint to compare, then the Fleet Console’s, pinned', async () => {
    const relay = new FakeRelay()
    const fleetConsole = await FakeConsole.make()
    m.ctx.dial = relay.dial
    relay.onJoin = async (join, conn) => {
      await conn.deliver('host.joined', { hostId: 'h1', machineCredential: 'hmc_4f1c2a9e7b3d5e8f0a1b', acceptance: await fleetConsole.acceptance('7KQ4M2XD46Q3', join.identity) })
    }
    expect(await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3')).toBe(0)
    expect(out).toMatch(/Reaching HQ at https:\/\/hq\.acme\.example \.+ found/)
    expect(out).toMatch(/ {2}Machine {7}hq-box\n {2}Fingerprint {3}[0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4} [0-9A-F]{4}\n/)
    expect(flat(out)).toContain('If what they see is different, they must not confirm: press Ctrl-C.')
    expect(flat(out)).toContain('Confirmed. hq-box is managed by the Fleet Console.')
    expect(out).toContain(`The Fleet Console's fingerprint, pinned: ${fleetConsole.fingerprint.slice(0, 16).toUpperCase().match(/.{4}/g)!.join(' ')}`)
    expect(flat(out)).toContain('The Fleet Console has not started the site here yet.')
  })

  it('names the site that moves in, not the machine', async () => {
    const relay = new FakeRelay()
    const fleetConsole = await FakeConsole.make()
    m.ctx.dial = relay.dial
    relay.onJoin = async (join, conn) => {
      await conn.deliver('host.joined', { hostId: 'h1', machineCredential: 'hmc_4f1c2a9e7b3d5e8f0a1b', acceptance: await fleetConsole.acceptance('7KQ4M2XD46Q3', join.identity) })
      writeReceive(m.ctx.state, {
        transferId: 't1', peer: 'p', peerIdentity: fleetConsole.keys.identity as never, siteName: 'berlin', peerName: 'machine-b', phase: 'waiting',
        armedAt: '2026-10-14T09:00:00Z', deadline: null, reason: null,
      })
    }
    await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3')
    expect(out).toMatch(/Receiving the site berlin from machine-b \.+ not yet/)
    expect(out).not.toContain('Starting the site hq-box')
    expect(flat(out)).toContain('The site berlin is moving here from machine-b.')
  })

  it('says a move of HQ brings HQ and its site, not that the site has not started', async () => {
    const relay = new FakeRelay()
    const fleetConsole = await FakeConsole.make()
    m.ctx.dial = relay.dial
    relay.onJoin = async (join, conn) => {
      await conn.deliver('host.joined', { hostId: 'h1', machineCredential: 'hmc_4f1c2a9e7b3d5e8f0a1b', acceptance: await fleetConsole.acceptance('7KQ4M2XD46Q3', join.identity) })
      writeReceive(m.ctx.state, {
        transferId: 't1', peer: 'p', peerIdentity: fleetConsole.keys.identity as never, siteName: 'machine-a', peerName: 'machine-a', phase: 'waiting',
        armedAt: '2026-10-14T09:00:00Z', deadline: null, reason: null, target: 'hq',
      })
    }
    await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3')
    expect(out).toMatch(/Receiving HQ and its site machine-a from machine-a \.+ under way/)
    expect(flat(out)).toContain('HQ and its site machine-a are moving here from machine-a.')
    expect(flat(out)).not.toContain('has not started the site here yet')
  })

  it('records the ports HQ and its Fleet Console will publish here, for HQ that moves in @SC-1242', async () => {
    const relay = new FakeRelay()
    const fleetConsole = await FakeConsole.make()
    m.ctx.dial = relay.dial
    relay.onJoin = async (join, conn) => {
      await conn.deliver('host.joined', { hostId: 'h1', machineCredential: 'hmc_4f1c2a9e7b3d5e8f0a1b', acceptance: await fleetConsole.acceptance('7KQ4M2XD46Q3', join.identity) })
    }
    expect(parseCommand(['console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3', '--hq-port', '7500', '--console-port', '7501']))
      .toEqual({ kind: 'consoleConnect', address: 'https://hq.acme.example', code: '7KQ4-M2XD-46Q3', hqPort: 7500, consolePort: 7501 })
    expect(await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3', '--hq-port', '7500', '--console-port', '7501')).toBe(0)
    expect(m.ctx.state.readJson('installation.json')).toMatchObject({ ports: { hq: 7500, console: 7501 } })
  })

  it('refuses ports it could not publish before reaching HQ, and keeps none when the connect fails @SC-1242 @SC-1244', async () => {
    const relay = new FakeRelay()
    m.ctx.dial = relay.dial
    expect(parseCommand(['console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3', '--hq-port'])).toMatchObject({ kind: 'usage' })
    expect(await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3', '--console-port', '80')).toBe(1)
    expect(flat(err)).toContain('Port 80 needs extra privileges on Linux.')
    expect(await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3', '--hq-port', '7500', '--console-port', '7500')).toBe(1)
    expect(relay.connections).toHaveLength(0)
    relay.onJoin = (_join, conn) => conn.deliver('host.joinRefused', { reason: 'used' })
    expect(await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3', '--console-port', '7501')).toBe(1)
    expect(m.ctx.state.readJson('installation.json')).toMatchObject({ ports: { hq: null, console: null } })
  })

  it('never moves the ports of HQ that runs here @SC-1242', async () => {
    await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
    expect(await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3', '--hq-port', '7600')).toBe(1)
    expect(flat(err)).toContain('HQ is already published here on port 7800, not 7600.')
    expect(m.ctx.state.readJson('installation.json')).toMatchObject({ ports: { hq: 7800 } })
  })

  it('says what to do when HQ closes the join before anyone confirmed', async () => {
    const relay = new FakeRelay()
    m.ctx.dial = relay.dial
    relay.onJoin = (_join, conn) => conn.drop()
    expect(await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3')).toBe(1)
    expect(flat(err)).toContain('HQ stopped answering, or no longer holds this code, before a fleet admin confirmed. Nothing was kept. Ask a fleet admin for a new one')
  })

  it('says why in words when the code ran out', async () => {
    const relay = new FakeRelay()
    m.ctx.dial = relay.dial
    relay.onJoin = (_join, conn) => conn.deliver('host.joinRefused', { reason: 'used' })
    expect(await cli('console', 'connect', 'https://hq.acme.example', '7KQ4-M2XD-46Q3')).toBe(1)
    expect(flat(err)).toContain('Refused: that code has expired or was already used.')
    expect(readPin(m.ctx.state)).toBeNull()
  })
})

describe('agenthix console disconnect @SC-848', () => {
  it('says what happens, asks, and forgets the Fleet Console', async () => {
    await pinned()
    answers = ['y']
    expect(await cli('console', 'disconnect')).toBe(0)
    expect(flat(out)).toContain('hq-box will no longer be managed by its Fleet Console.')
    expect(flat(out)).toContain('Disconnected. This machine dropped its credential and no longer answers the Fleet Console.')
    expect(readPin(m.ctx.state)).toBeNull()
  })

  it('changes nothing when the answer is no', async () => {
    await pinned()
    answers = ['n']
    expect(await cli('console', 'disconnect')).toBe(1)
    expect(readPin(m.ctx.state)).not.toBeNull()
  })

  it('is refused on HQ’s machine', async () => {
    await cli('install', '--address', 'https://hq.acme.example')
    err = ''
    expect(await cli('console', 'disconnect', '--yes')).toBe(1)
    expect(flat(err)).toContain('Not here: hq-box is where HQ runs, with its site, so it cannot leave.')
  })
})

describe('agenthix status @SC-853', () => {
  it('says the machine is managed, by which Fleet Console, and whether it is connected', async () => {
    const fleetConsole = await pinned()
    await cli('status')
    expect(flat(out)).toContain(`Managed by a Fleet Console (its fingerprint ${fleetConsole.fingerprint.slice(0, 4).toUpperCase()}`)
    expect(flat(out)).toContain('through HQ at https://hq.acme.example. Connected.')
  })

  it('says how to connect a machine that runs nothing yet', async () => {
    await cli('status')
    expect(flat(out)).toContain('Not managed by a Fleet Console, so no site runs here.')
    expect(out).toContain('agenthix console connect <hq address> <code>')
  })

  it('says a Fleet Console retired on another machine than HQ’s is gone, and how it comes back here', async () => {
    const here = await FakeConsole.make()
    m.consoleAnswers['handover-status'] = { state: 'fresh', fingerprint: here.fingerprint }
    await cli('console', 'install', 'https://hq.acme.example', '4HQW-N7TE-M9S3', '--yes')
    writePin(m.ctx.state, {
      console: here.keys.identity as never, consoleFingerprint: here.fingerprint, hqAddress: 'https://hq.acme.example',
      hostId: 'h1', machineCredential: 'hmc_0123456789abcdef', pinnedAt: '2026-10-14T09:00:00.000Z', local: false,
    })
    const next = await FakeConsole.make()
    await followHandover({ state: m.ctx.state, keys: () => hostKeys(m.ctx.state), send: () => {}, now: () => new Date() },
      [await signHandoverCertificate(here.keys, next.keys.identity, 'machine-a')])
    expect(await retireHandedOverConsole(m.ctx)).toBe(true)
    out = ''
    await cli('status')
    expect(flat(out)).toContain('Retired here. It runs on machine-a now, and fleet admins open it there.')
    expect(flat(out)).toContain("To bring it back here, a machine admin of HQ's machine runs agenthix hq console-code there; then here: agenthix console install <hq address> <code>")
    expect(out).not.toContain('Fleet admins open it here')
  })

  it('shows the Fleet Console on HQ’s machine', async () => {
    await cli('install', '--address', 'https://hq.acme.example')
    out = ''
    await cli('status')
    expect(out).toContain('Fleet Console  http://127.0.0.1:7801  0.2.0')
    expect(flat(out)).toContain('This machine is not connected to it yet; it keeps trying by itself.')
  })
})

describe('console install @SC-853', () => {
  it('starts the Fleet Console here and says how many machines follow it', async () => {
    m.consoleAnswers['handover-status'] = { state: 'handedOver', from: '5F2A 9C1E 77B0 D4E3', hosts: 3, repinned: 3 }
    expect(await cli('console', 'install', 'https://hq.acme.example', '4HQW-N7TE-M9S3', '--yes')).toBe(0)
    expect(out).toMatch(/Connecting it to HQ \.+ connected/)
    expect(out).toMatch(/Machines pin its new key \.+ 3 of 3/)
    expect(flat(out)).toContain('Moved. The Fleet Console now runs on hq-box, and 3 of 3 machines follow it.')
  })

  it('says the image passes its signature check when it was checked', async () => {
    m.consoleAnswers['handover-status'] = { state: 'fresh' }
    await cli('console', 'install', 'https://hq.acme.example', '4HQW-N7TE-M9S3', '--yes')
    expect(out).toMatch(/is signed by .*\.+ passes/)
  })

  it('says the image was not checked on a development build, as install does', async () => {
    m.consoleAnswers['handover-status'] = { state: 'fresh' }
    m.ctx.machine.hostServiceVersion = 'dev'
    await cli('console', 'install', 'https://hq.acme.example', '4HQW-N7TE-M9S3', '--yes')
    expect(out).toMatch(/is signed by .*\.+ not checked: images built here \(development build\)/)
  })

  it('says when it started with no machines, because none was running to hand them over', async () => {
    m.consoleAnswers['handover-status'] = { state: 'fresh' }
    expect(await cli('console', 'install', 'https://hq.acme.example', '4HQW-N7TE-M9S3', '--yes')).toBe(0)
    expect(flat(out)).toContain('with no machines: none was running to hand them over')
    expect(out).toContain('agenthix console connect <hq address> <code>')
  })

  it('says why when the move was refused', async () => {
    m.consoleAnswers['handover-status'] = { state: 'failed', problem: 'The answer that came through HQ did not prove it.' }
    expect(await cli('console', 'install', 'https://hq.acme.example', '4HQW-N7TE-M9S3', '--yes')).toBe(0)
    expect(flat(out)).toContain('Not moved. The answer that came through HQ did not prove it.')
  })
})

describe('HQ’s commands for the Fleet Console @SC-853', () => {
  beforeEach(async () => {
    await cli('install', '--address', 'https://hq.acme.example')
    out = ''
    err = ''
  })

  it('hq console-code asks the Fleet Console here for the code, which hands every machine over', async () => {
    m.consoleAnswers['handover-code'] = { code: '4HQWN7TEM9S3', expiresAt: '2026-10-14T10:00:00Z' }
    m.hq['console-code'] = { ok: true, text: '', data: { code: 'ZZZZZZZZZZZZ', expiresAt: '2026-10-14T10:00:00Z' } }
    answers = ['y']
    expect(await cli('hq', 'console-code')).toBe(0)
    expect(flat(out)).toContain('The Fleet Console runs on hq-box.')
    expect(flat(out)).toContain('every machine it manages follows it')
    expect(out).toContain('  Code: 4HQW-N7TE-M9S3')
    expect(out).toContain('agenthix console install https://hq.acme.example 4HQW-N7TE-M9S3')
    expect(flat(out)).toContain('the one here hands it every machine and is retired')
    // HQ made no code: the code came from the Fleet Console here, through its own command line.
    expect(m.calls.some(c => c[0] === 'exec' && c.includes('agenthix-console') && c.includes('handover-code'))).toBe(true)
    expect(m.calls.some(c => c[0] === 'exec' && c.includes('console-code'))).toBe(false)
  })

  it('hq console-code says no Fleet Console runs here, and has HQ make a code for one with no machines', async () => {
    m.up.delete('agenthix-console')
    m.hq['console-code'] = { ok: true, text: '', data: { code: '4HQWN7TEM9S3', expiresAt: '2026-10-14T10:00:00Z' } }
    answers = ['y']
    expect(await cli('hq', 'console-code')).toBe(0)
    expect(flat(out)).toContain('No Fleet Console is running on hq-box.')
    expect(flat(out)).toContain('each machine connects to it again')
    expect(out).toContain('  Code: 4HQW-N7TE-M9S3')
    expect(flat(out)).toContain('machines connect to the new one again')
  })

  it('hq console-code with --no-machines says Nothing was changed when the answer is no', async () => {
    answers = ['n']
    expect(await cli('hq', 'console-code', '--no-machines')).toBe(1)
    expect(out).toContain('Nothing was changed.')
    expect(m.calls.some(c => c.includes('console-code'))).toBe(false)
  })

  it('hq console-code makes nothing when the Fleet Console here cannot', async () => {
    answers = ['y']
    expect(await cli('hq', 'console-code')).toBe(1)
    expect(flat(err)).toContain('The Fleet Console here could not make a code: HQ is not answering.')
    expect(m.calls.some(c => c[0] === 'exec' && c.includes('console-code'))).toBe(false)
  })

  describe('when the Fleet Console runs on another machine', () => {
    let fleetConsole: FakeConsole
    let asks: { askId: string; envelope: HostEnvelope }[]
    /** How the Fleet Console elsewhere answers this machine's ask; null for not at all. */
    let reply: ((askId: string) => Promise<unknown>) | null

    beforeEach(async () => {
      m.up.delete('agenthix-console')
      fleetConsole = await pinned()
      asks = []
      reply = null
      const handle = envelopeHandler({
        state: m.ctx.state, keys: () => hostKeys(m.ctx.state), replay: new EnvelopeReplayGuard(Date.now() - 120_000),
        operate: async () => { throw new Error('no request expected') }, send: () => {}, now: () => Date.now(),
      })
      m.ctx.link = {
        start: () => {}, stop: () => {}, connected: () => true,
        sendEnvelope: envelope => {
          void (async () => {
            const opened = await fleetConsole.open(envelope, (await hostKeys(m.ctx.state)).identity)
            if (!opened.ok) throw new Error(opened.reason)
            const askId = (opened.message as { askId: string }).askId
            asks.push({ askId, envelope })
            if (reply) await handle(await reply(askId))
          })()
        },
      }
    })

    const answerWith = (answer: HandoverCodeAnswer, from = fleetConsole) => async (askId: string) =>
      from.seal((await hostKeys(m.ctx.state)).identity, { kind: 'handoverCode', replyTo: askId, answer })

    it('hq console-code asks it for the code in a sealed envelope, and prints the code it seals back', async () => {
      reply = answerWith({ ok: true, code: 'K7QMN7TEM9S3', expiresAt: '2026-10-14T10:00:00Z' })
      answers = ['y']
      expect(await cli('hq', 'console-code')).toBe(0)
      expect(flat(out)).toContain('The Fleet Console runs on another machine, and hq-box is one of the machines it manages.')
      expect(out).toContain('  Code: K7QM-N7TE-M9S3')
      expect(flat(out)).toContain('the one that runs now hands it every machine and is retired')
      expect(flat(out)).toContain('To bring the Fleet Console back to this machine instead, run the same command here, on hq-box.')
      expect(asks).toHaveLength(1)
      // HQ made no code, and the code never crossed HQ in the clear.
      expect(m.calls.some(c => c[0] === 'exec' && c.includes('console-code'))).toBe(false)
      expect(JSON.stringify(asks)).not.toContain('K7QM')
    })

    it('hq console-code makes nothing when that Fleet Console refuses, and says why', async () => {
      reply = answerWith({ ok: false, problem: "Only HQ's machine may ask the Fleet Console for a code to move it." })
      answers = ['y']
      expect(await cli('hq', 'console-code')).toBe(1)
      expect(flat(err)).toContain("Only HQ's machine may ask the Fleet Console for a code to move it.")
    })

    it('hq console-code takes no code HQ makes up in that Fleet Console’s place, and never falls back to one of HQ’s', async () => {
      const hq = await FakeConsole.make()
      reply = async askId => {
        const forged = await answerWith({ ok: true, code: 'K7QMN7TEM9S3', expiresAt: '2026-10-14T10:00:00Z' }, hq)(askId)
        // Then HQ says the Fleet Console is not connected.
        setTimeout(() => handoverCodeUndeliverable(asks[0].envelope.id, 'recipient_offline'), 10)
        return forged
      }
      m.hq['console-code'] = { ok: true, text: '', data: { code: 'H7QMN7TEM9S3', expiresAt: '2026-10-14T10:00:00Z' } }
      answers = ['y']
      expect(await cli('hq', 'console-code')).toBe(1)
      expect(out).not.toContain('Code:')
      expect(flat(err)).toContain('is not connected to HQ just now')
      expect(m.calls.some(c => c[0] === 'exec' && c.includes('console-code'))).toBe(false)
    })
  })

  it('hq fleet-admin asks, then passes on what HQ says @SC-852', async () => {
    m.hq['fleet-admin'] = { ok: true, text: 'Done. Avery Chen is a fleet admin.' }
    expect(await cli('hq', 'fleet-admin', 'avery', '--yes')).toBe(0)
    expect(out).toContain('Done. Avery Chen is a fleet admin.')
    expect(m.calls.some(c => c[0] === 'exec' && c.includes('fleet-admin') && c.includes('avery'))).toBe(true)
  })

  it('hq fleet-admin --remove takes the role away, asking first @SC-852', async () => {
    m.hq['fleet-admin'] = { ok: true, text: 'Done. Avery Chen is no longer a fleet admin.' }
    expect(parseCommand(['hq', 'fleet-admin', '--remove', 'avery'])).toEqual({ kind: 'fleetAdmin', user: 'avery', yes: false, remove: true })
    expect(await cli('hq', 'fleet-admin', '--remove', 'avery', '--yes')).toBe(0)
    expect(out).toContain('no longer a fleet admin')
    expect(m.calls.some(c => c[0] === 'exec' && c.includes('fleet-admin') && c.includes('--remove') && c.includes('avery'))).toBe(true)
  })

  it('hq fleet-admin names a mistyped user @SC-852', async () => {
    m.hq['fleet-admin'] = { ok: false, error: 'No such user', code: 'not_found' }
    expect(await cli('hq', 'fleet-admin', 'avry', '--yes')).toBe(1)
    expect(flat(err)).toContain('Not found: no one signs in to HQ as "avry".')
  })
})
