import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { ownerHandler } from '../../owner/dispatch'
import { collectFigures } from '../../figures/figures'
import { statusText, type StatusWithBackups } from '../../cli/statusText'
import { portProbe } from '../../install/portCheck'
import { blockedParts, reportBlockedAfterStart } from '../portsBlocked'

let m: FakeMachine
beforeEach(async () => {
  m = fakeMachine()
  await install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
})
afterEach(() => m.cleanup())

/** After a reboot: Docker could not start the container, since another program took its port first. */
function notStarted(name: string, port: number): void {
  m.machineContainers.push({ name, labels: { 'agenthix.managed-by': 'host', 'agenthix.ports': '7800,7801' }, running: false, published: [] })
  m.heldPorts.add(port)
}

const HQ_BLOCKED = 'HQ cannot start: port 7800 is held by a program on this machine, not by a container. Free it, or move HQ to another port with agenthix hq address <address>.'
const flat = (t: string) => t.replace(/\s+/g, ' ')

describe('a part that could not start for a taken port @SC-1245', () => {
  it('is said for HQ and for the Fleet Console, naming the port, its holder and what to do', async () => {
    notStarted('agenthix-hq-web', 7800)
    m.machineContainers.push({ name: 'agenthix-console', labels: { 'agenthix.managed-by': 'host' }, running: false, published: [] })
    m.machineContainers.push({ name: 'grafana', labels: {}, running: true, published: [{ ip: '127.0.0.1', port: 7801 }] })
    expect((await blockedParts(m.ctx)).map(b => b.text)).toEqual([
      HQ_BLOCKED,
      'The Fleet Console cannot start: port 7801 is held by the container grafana. Free it, or move the Fleet Console with agenthix console port <port>.',
    ])
  })

  it('is nothing while the part runs, or while its port is free', async () => {
    m.machineContainers.push({ name: 'agenthix-hq-web', labels: { 'agenthix.managed-by': 'host' }, running: true, published: [{ ip: '127.0.0.1', port: 7800 }] })
    m.machineContainers.push({ name: 'agenthix-console', labels: { 'agenthix.managed-by': 'host' }, running: false, published: [] })
    expect(await blockedParts(m.ctx)).toEqual([])
  })

  it('is in agenthix status, in place of how to start HQ again', async () => {
    notStarted('agenthix-hq-web', 7800)
    m.up.delete('agenthix-hq')
    const answer = await ownerHandler(m.ctx)({ op: 'machine.status' }, () => {}) as { ok: true; result: StatusWithBackups }
    expect(answer.result.blocked).toMatchObject([{ part: 'hq', port: 7800 }])
    const text = flat(statusText(answer.result))
    expect(text).toContain(HQ_BLOCKED)
    expect(text).not.toContain('Stopped. Nothing is lost.')
  })

  it("is the problem HQ's figures give the Fleet Console", async () => {
    notStarted('agenthix-hq-web', 7800)
    m.up.delete('agenthix-hq')
    const figures = await collectFigures(m.ctx)
    expect(figures.installs.find(i => i.target === 'hq')).toMatchObject({ state: 'stopped', problem: HQ_BLOCKED })
  })

  it("is said on Docker Desktop for a program on the computer, which only Docker's own publish finds", async () => {
    m.machineContainers.push({ name: 'agenthix-hq-web', labels: { 'agenthix.managed-by': 'host' }, running: false, published: [] })
    const asked = vi.spyOn(m.ctx.docker, 'publishProbe').mockImplementation(async port => port === 7800)
    expect(await blockedParts(m.ctx)).toEqual([])
    expect((await blockedParts(m.ctx, portProbe(m.ctx, '6.10.14-linuxkit'))).map(b => b.text)).toEqual([HQ_BLOCKED])
    expect(asked).toHaveBeenCalledWith(7800, '127.0.0.1', 'agenthix-host')
  })

  it('is said in the host service log a while after it starts', async () => {
    vi.useFakeTimers()
    try {
      notStarted('agenthix-hq-web', 7800)
      const lines: string[] = []
      reportBlockedAfterStart(m.ctx, line => lines.push(line), 1_000)
      await vi.advanceTimersByTimeAsync(1_000)
      expect(lines).toEqual([HQ_BLOCKED])
    } finally {
      vi.useRealTimers()
    }
  })
})
