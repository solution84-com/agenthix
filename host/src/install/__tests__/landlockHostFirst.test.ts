import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { digestOf, fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../install'
import { installed } from '../../service/context'
import { scheduleChange, tickScheduled } from '../../scheduled/scheduler'
import { readStore } from '../../scheduled/store'
import { readSwitch } from '../../launcher/journal'
import { NEW_IMAGE } from '../../launcher/__tests__/fakeContainers'
import '../../upgrades/operations'

const REGISTRY = 'ghcr.io/solution84-com'
const agentPinned = (v: string) => `${REGISTRY}/agenthix-agent@${digestOf(`${REGISTRY}/agenthix-agent:${v}`)}`
const HOST_030 = `${REGISTRY}/agenthix-host@${digestOf(`${REGISTRY}/agenthix-host:0.3.0`)}`

let m: FakeMachine
beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
  m.hq['scheduled-change'] = { ok: true, text: 'Taken.' }
  m.containers.refs.set(HOST_030, NEW_IMAGE)
  for (const part of ['hq-server', 'hq-web', 'relay', 'site-server', 'agent', 'executor', 'host']) m.tags.set(`solution84-com/agenthix-${part}`, ['0.2.0', '0.3.0'])
})
afterEach(() => m.cleanup())

const probed = () => m.calls.filter(c => c[0] === 'run' && c[c.length - 1] === '--abi').map(c => c[c.length - 3])

/** A scheduled upgrade of HQ to 0.3.0, which moves the host service to 0.3 first, run at its time. */
async function runScheduled(): Promise<void> {
  await scheduleChange(m.ctx, { op: 'upgrade', target: 'hq', version: '0.3.0' }, new Date(m.ctx.now().getTime() + 60_000).toISOString(), { kind: 'machineAdmin' })
  m.calls.length = 0
  await m.ctx.sleep(5 * 60_000)
  await tickScheduled(m.ctx)
}

describe('an upgrade that moves the host service first', () => {
  it('refuses on ABI 4 before the host service moves, asking the agent image the site runs', async () => {
    m.landlock.stdout = '4\n'
    await runScheduled()
    const entry = readStore(m.ctx.state).entries[0]
    expect(entry.change.state).toBe('rolledBack')
    expect(entry.notice!.reason).toMatch(/Not upgraded: this machine's kernel .* It has Landlock 4\./)
    expect(probed()).toEqual([agentPinned('0.2.0')])
    expect(readSwitch(m.ctx.state)).toBeNull()
    expect(m.containers.byName('agenthix-host-launcher')).toBeNull()
    expect(m.calls.filter(c => c[0] === 'compose' && (c.includes('stop') || c.includes('up')))).toEqual([])
    expect(installed(m.ctx).hq!.settings.version).toBe('0.2.0')
  })

  it('moves the host service on ABI 8', async () => {
    await runScheduled()
    expect(probed()).toEqual([agentPinned('0.2.0')])
    expect(readSwitch(m.ctx.state)).not.toBeNull()
    expect(m.containers.byName('agenthix-host-launcher')).not.toBeNull()
  })
})
