import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { digestOf, fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { parseOwnerRequest } from '../../owner/requests'
import { installed } from '../../service/context'
import { listScheduled, tickScheduled } from '../../scheduled/scheduler'
import { readStore } from '../../scheduled/store'
import type { HqStatusData } from '../../hq/control'
import { readSwitch } from '../../launcher/journal'
import { NEW_IMAGE, OLD_IMAGE } from '../../launcher/__tests__/fakeContainers'
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
const send: Send = (request, onProgress) => ownerHandler(m.ctx)(request, onProgress) as Promise<Record<string, unknown>>
const cli = (...argv: string[]) => runCommand(parseCommand(argv), send, io, '0.2.0', () => m.ctx.now())
const flat = (s: string) => s.replace(/\s+/g, ' ')

const HOST_030 = `ghcr.io/solution84-com/agenthix-host@${digestOf('ghcr.io/solution84-com/agenthix-host:0.3.0')}`

function publish(versions: string[]): void {
  for (const part of ['hq-server', 'hq-web', 'relay', 'site-server', 'agent', 'host']) m.tags.set(`solution84-com/agenthix-${part}`, versions)
}

beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  m.containers.refs.set(HOST_030, NEW_IMAGE)
  publish(['0.2.0', '0.3.0'])
  out = ''
  err = ''
  answers = []
})
afterEach(() => m.cleanup())

describe('agenthix upgrades host, with the launcher on @SC-838', () => {
  it('says what happens, asks, then starts the launcher from its own image with the checked image’s id', async () => {
    answers = ['y']
    expect(await cli('upgrades', 'host')).toBe(0)
    const said = flat(out)
    expect(said).toContain('Switching the host service from 0.2.0 to 0.3.0.')
    expect(said).toContain('if the new one does not answer within 3 minutes, this one is started again as it was')
    expect(said).toContain('The launcher is switching it to 0.3.0 now')
    expect(m.checked.map(c => c[0])).toContain('ghcr.io/solution84-com/agenthix-host:0.3.0')

    const launcher = m.containers.byName('agenthix-host-launcher')!
    expect(launcher).toMatchObject({ image: OLD_IMAGE, network: 'none', capAdd: [], restart: 'unless-stopped' })
    // In the host service's own group in Docker Desktop, beside the host service it replaces.
    expect(launcher.labels).toEqual({ 'com.docker.compose.project': 'agenthix-host' })
    expect(launcher.command).toEqual(['node', '--enable-source-maps', '/app/dist/launcher.js', 'swap', NEW_IMAGE])
    expect(launcher.mounts!.map(x => x.destination)).toEqual(['/var/run/docker.sock', '/state'])
    expect(readSwitch(m.ctx.state)).toMatchObject({ from: '0.2.0', to: '0.3.0', ref: HOST_030, imageId: NEW_IMAGE, checked: true, phase: 'ready' })
  })

  it('changes nothing when the person says no', async () => {
    answers = ['n']
    expect(await cli('upgrades', 'host')).toBe(1)
    expect(m.containers.byName('agenthix-host-launcher')).toBeNull()
    expect(readSwitch(m.ctx.state)).toBeNull()
  })

  it('refuses an image whose signature does not check, before any launcher starts @SC-1275', async () => {
    m.signatures.set('ghcr.io/solution84-com/agenthix-host:0.3.0', { kind: 'unsigned' })
    expect(await cli('upgrades', 'host', '--yes')).toBe(1)
    expect(flat(err)).toContain('carries no signature')
    expect(m.containers.byName('agenthix-host-launcher')).toBeNull()
  })

  it('takes the settings it starts the new one with from Docker, never from the request', async () => {
    const answer = await ownerHandler(m.ctx)({ op: 'upgrades.hostSwitch', version: '0.3.0', network: 'none', image: 'evil', env: ['X=1'] }, () => {}) as { ok: boolean }
    expect(answer.ok).toBe(true)
    expect(parseOwnerRequest({ op: 'upgrades.hostSwitch', version: '0.3.0', image: 'evil' })).toEqual({ ok: true, request: { op: 'upgrades.hostSwitch', version: '0.3.0' } })
    expect(parseOwnerRequest({ op: 'upgrades.hostSwitch', version: 'latest' })).toMatchObject({ ok: false })
    expect(m.ctx.state.readJson('launcher', 'container.json')).toMatchObject({ network: 'host', env: ['TZ=Europe/London'] })
  })

  it('is refused for a development build, which is switched by building it again', async () => {
    m.ctx.machine.hostServiceVersion = 'dev'
    const answer = await ownerHandler(m.ctx)({ op: 'upgrades.hostSwitch' }, () => {}) as { ok: boolean; refusal: { message: string } }
    expect(answer).toMatchObject({ ok: false, refusal: { message: expect.stringContaining('development build') } })
  })
})

describe('agenthix upgrades host --launcher off @SC-838', () => {
  it('turns the launcher off, and then prints the two commands from the recorded settings', async () => {
    expect(await cli('upgrades', 'host', '--launcher', 'off')).toBe(0)
    expect(flat(out)).toContain('The launcher is off')
    out = ''
    expect(await cli('upgrades', 'host')).toBe(0)
    expect(out).toContain('  docker rm -f agenthix-host\n')
    expect(out).toContain(`  docker run -d --name agenthix-host --restart unless-stopped --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock --mount type=bind,src=/home/sam/.agenthix,dst=/state --mount type=volume,src=agenthix-host-figures,dst=/run/host-figures --network host --cap-add NET_ADMIN -e TZ=Europe/London --label com.docker.compose.project=agenthix-host ${HOST_030.replace('@', ':0.3.0@')}\n`)
    expect(flat(out)).toContain('To let the host service switch itself: agenthix upgrades host --launcher on')
    expect(m.containers.byName('agenthix-host-launcher')).toBeNull()
    expect(await cli('upgrades', 'host', '--launcher', 'maybe')).toBe(2)
  })
})

describe('a new minor version of HQ @SC-838', () => {
  const hqAs = (version: string) => {
    const data = (m.hq.status as unknown as { data: HqStatusData }).data
    m.hq.status = { ok: true, text: 'HQ', data: { ...data, version } }
  }

  it('is scheduled with the host service moving first, by itself', async () => {
    expect(await cli('hq', 'upgrade', '0.3.0', '--yes')).toBe(0)
    expect(flat(out)).toContain('Then the host service moves to 0.3.0 first, by itself, and HQ and its site stop for a few minutes')
    expect(listScheduled(m.ctx)[0]).toMatchObject({ kind: 'upgrade', detail: '0.3.0' })
  })

  it('at its time starts the launcher; when it stops without switching, the upgrade is put back and status says why', async () => {
    expect(await cli('hq', 'upgrade', '0.3.0', '--yes')).toBe(0)
    const run = m.containers.run.bind(m.containers)
    // A launcher that stops at once, having switched nothing.
    m.containers.run = async spec => {
      await run(spec)
      if (spec.name === 'agenthix-host-launcher') m.containers.byName('agenthix-host-launcher')!.running = false
    }
    await m.ctx.sleep(5 * 60_000)
    await tickScheduled(m.ctx)
    const entry = readStore(m.ctx.state).entries[0]
    expect(entry.change.state).toBe('rolledBack')
    expect(entry.notice!.reason).toContain('It needs the host service 0.3 first, and the host service did not move to 0.3.0: The launcher stopped before it switched anything.')
    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.0')
    out = ''
    expect(await cli('status')).toBe(0)
    expect(flat(out)).toContain('The host service did not move to 0.3.0 on')
  })

  it('is carried on by the new host service, which runs the upgrade as its own version', async () => {
    expect(await cli('hq', 'upgrade', '0.3.0', '--yes')).toBe(0)
    m.ctx.machine.hostServiceVersion = '0.3.0'
    hqAs('0.3.0')
    await m.ctx.sleep(5 * 60_000)
    await tickScheduled(m.ctx)
    expect(installed(m.ctx).hq!.settings.version).toBe('0.3.0')
    expect(m.containers.byName('agenthix-host-launcher')).toBeNull()
  })

  it('waits for the machine admin when the launcher is off', async () => {
    await cli('upgrades', 'host', '--launcher', 'off')
    out = ''
    expect(await cli('hq', 'upgrade', '0.3.0', '--yes')).toBe(1)
    expect(flat(out)).toContain('HQ 0.3.0 needs the host service 0.3.0 first; this one is older.')
    expect(listScheduled(m.ctx)).toEqual([])
  })
})

describe('the owner socket @SC-838', () => {
  it('answers the host service’s version, which is how the launcher knows a new one is up', async () => {
    expect(await ownerHandler(m.ctx)({ op: 'host.version' }, () => {})).toEqual({ ok: true, op: 'host.version', result: { version: '0.2.0' } })
  })
})
