import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { Refusal } from '../../owner/results'
import { recordPorts } from '../../state/installation'
import { checkPorts, otherInstallation, portProblems, portProbe, type PortAsk } from '../portCheck'
import { parseContainerInspect } from '../../docker/machineContainers'

let m: FakeMachine
beforeEach(() => { m = fakeMachine() })
afterEach(() => m.cleanup())

const hq = (port: number): PortAsk => ({ port, part: 'hq', bind: '0.0.0.0' })
const fleetConsole = (port: number): PortAsk => ({ port, part: 'console', bind: '127.0.0.1' })
const texts = async (asks: PortAsk[]) => (await portProblems(m.ctx, asks)).map(p => p.text)

describe('the port check @SC-1244 @SC-1248', () => {
  it('passes free ports in range, asking the probe on the address each would be published on', async () => {
    const asked: string[] = []
    m.ctx.portInUse = async (port, host) => { asked.push(`${host}:${port}`); return false }
    await expect(checkPorts(m.ctx, [hq(7800), fleetConsole(7801)])).resolves.toBeUndefined()
    expect(asked).toEqual(['0.0.0.0:7800', '127.0.0.1:7801'])
  })

  it('refuses a port out of range, naming the flag and the range', async () => {
    expect(await texts([fleetConsole(80)])).toEqual([
      'Port 80, for the Fleet Console, needs extra privileges on Linux. Choose another with --console-port, from 1024 to 32767.',
    ])
    expect(await texts([hq(40000)])).toEqual([
      'Port 40000, for HQ, is in the range the operating system gives to outgoing connections, so it could be taken at any time. ' +
      'Choose another with --hq-port, from 1024 to 32767, or 80 or 443.',
    ])
    expect(await texts([hq(443)])).toEqual([])
  })

  it("refuses another installation's port, from its label, whether its container runs or not", async () => {
    m.machineContainers.push(
      { name: 'mobiletest-hq-web', labels: { 'mobiletest.managed-by': 'host', 'mobiletest.ports': '7500,7520' }, running: false, published: [] },
      // A label that only looks alike is no installation's.
      { name: 'acme', labels: { 'acme.ports': '7600' }, running: false, published: [] },
    )
    expect(await texts([fleetConsole(7520)])).toEqual([
      'Port 7520, for the Fleet Console, is held by another installation on this machine, mobiletest (its container mobiletest-hq-web). Choose another with --console-port.',
    ])
    expect(await texts([hq(7600)])).toEqual([])
  })

  it('names the container Docker publishes a held port for, and a program outside Docker otherwise', async () => {
    m.machineContainers.push({ name: 'grafana', labels: {}, running: true, published: [{ ip: '0.0.0.0', port: 7800 }] })
    m.heldPorts.add(7801)
    expect(await texts([hq(7800), fleetConsole(7801)])).toEqual([
      'Port 7800, for HQ, is held by the container grafana. Choose another with --hq-port.',
      'Port 7801, for the Fleet Console, is held by a program on this machine, not by a container. Choose another with --console-port.',
    ])
  })

  it('takes no problem with a port this installation holds itself', async () => {
    m.machineContainers.push({ name: 'agenthix-hq-web', labels: { 'agenthix.managed-by': 'host', 'agenthix.ports': '7800' }, running: true, published: [{ ip: '127.0.0.1', port: 7800 }] })
    await expect(checkPorts(m.ctx, [hq(7800)])).resolves.toBeUndefined()
  })

  it("refuses a port another part of this installation publishes, and two parts asking for one port", async () => {
    m.ctx.state.writeJson(['hq', 'settings.json'], { address: 'http://localhost:7800', bind: '127.0.0.1' })
    recordPorts(m.ctx.state, { hq: 7800 })
    expect(await texts([fleetConsole(7800)])).toEqual([
      "Port 7800, for the Fleet Console, is HQ's own port in this installation. Choose another with --console-port.",
    ])
    expect(await texts([hq(7900), fleetConsole(7900)])).toHaveLength(2)
  })

  it('says when a port cannot be checked', async () => {
    m.ctx.portInUse = async () => null
    expect(await texts([hq(7800)])).toEqual([
      'Port 7800, for HQ, could not be checked: the host service cannot listen on 0.0.0.0:7800 to see whether it is free. Choose another with --hq-port.',
    ])
  })

  it('puts every problem in one refusal, ending "Nothing was changed."', async () => {
    m.heldPorts.add(7800).add(7801)
    const refused = await checkPorts(m.ctx, [hq(7800), { ...fleetConsole(7801), another: 'Choose another port.' }]).catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(Refusal)
    expect(refused).toMatchObject({ code: 'conflict' })
    expect((refused as Refusal).message).toBe(
      'Port 7800, for HQ, is held by a program on this machine, not by a container. Choose another with --hq-port. ' +
      'Port 7801, for the Fleet Console, is held by a program on this machine, not by a container. Choose another port. Nothing was changed.',
    )
  })
})

describe('on Docker Desktop, where the bind probe sees only Docker\'s virtual machine @SC-1244', () => {
  const DESKTOP = '6.10.14-linuxkit'
  /** What Docker answers when asked to publish each port: held by a program on the computer, free, or no answer. */
  const docker = (answers: Record<number, boolean | null>) =>
    vi.spyOn(m.ctx.docker, 'publishProbe').mockImplementation(async port => (port in answers ? answers[port] ?? null : false))

  it("refuses a port a program on the computer holds, found by Docker's own publish, in the check's one refusal", async () => {
    const asked = docker({ 7802: true })
    const refused = await checkPorts(m.ctx, [fleetConsole(7802)], portProbe(m.ctx, DESKTOP)).catch((e: unknown) => e)
    expect(refused).toMatchObject({ code: 'conflict' })
    expect((refused as Refusal).message).toBe(
      'Port 7802, for the Fleet Console, is held by a program on this machine, not by a container. Choose another with --console-port. Nothing was changed.')
    expect(asked).toHaveBeenCalledWith(7802, '127.0.0.1', 'agenthix-host')
  })

  it('passes a port Docker publishes, and does not ask Docker for one the bind probe already finds held', async () => {
    const asked = docker({})
    m.heldPorts.add(7801)
    expect((await portProblems(m.ctx, [hq(7800), fleetConsole(7801)], portProbe(m.ctx, DESKTOP))).map(p => p.port)).toEqual([7801])
    expect(asked.mock.calls.map(c => c[0])).toEqual([7800])
  })

  it('names a container that publishes the port, without asking Docker to publish it', async () => {
    const asked = docker({ 7800: true })
    m.machineContainers.push({ name: 'grafana', labels: {}, running: true, published: [{ ip: '0.0.0.0', port: 7800 }] })
    expect((await portProblems(m.ctx, [hq(7800)], portProbe(m.ctx, DESKTOP))).map(p => p.text)).toEqual([
      'Port 7800, for HQ, is held by the container grafana. Choose another with --hq-port.',
    ])
    expect(asked).not.toHaveBeenCalled()
  })

  it('says a port could not be checked when Docker cannot run the probe', async () => {
    docker({ 7800: null })
    expect((await portProblems(m.ctx, [hq(7800)], portProbe(m.ctx, DESKTOP))).map(p => p.text)).toEqual([
      'Port 7800, for HQ, could not be checked: Docker could not publish 0.0.0.0:7800 from a test container to see whether it is free. Choose another with --hq-port.',
    ])
  })

  it('is not asked anywhere else: elsewhere the bind probe sees the machine itself', async () => {
    const asked = docker({ 7800: true })
    expect(await portProblems(m.ctx, [hq(7800)], portProbe(m.ctx, '6.8.0-45-generic'))).toEqual([])
    expect(asked).not.toHaveBeenCalled()
  })
})

describe("the machine's containers, as Docker inspects them @SC-1244 @SC-1248", () => {
  it('reads labels holding commas, and the ports published while it runs', () => {
    const line = ['/other-hq-web', { 'other.managed-by': 'host', 'other.ports': '7500,7520' }, true,
      { '4100/tcp': [{ HostIp: '0.0.0.0', HostPort: '7500' }, { HostIp: '::', HostPort: '7500' }], '4101/tcp': null }]
      .map(v => JSON.stringify(v)).join('\t')
    const [c] = parseContainerInspect(`${line}\nnot a line\n`)
    expect(c).toEqual({
      name: 'other-hq-web', labels: { 'other.managed-by': 'host', 'other.ports': '7500,7520' }, running: true,
      published: [{ ip: '0.0.0.0', port: 7500 }, { ip: '::', port: 7500 }],
    })
    expect(otherInstallation(c!, 'agenthix')).toEqual({ namespace: 'other', ports: [7500, 7520] })
    expect(otherInstallation(c!, 'other')).toBeNull()
  })
})
