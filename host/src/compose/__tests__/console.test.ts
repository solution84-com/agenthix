import { describe, expect, it } from 'vitest'
import { consoleProject, type ConsoleSettings } from '../console'
import { namesFor } from '../../state/namespace'
import { chooseSubnets } from '../subnets'
import type { Installation } from '../../state/installation'

const inst: Installation = { namespace: 'agenthix', ports: { hq: 7800, console: 7801 }, agentRange: null, recordedAt: '2026-10-24T00:00:00.000Z' }

const names = namesFor('agenthix')
const settings = (over: Partial<ConsoleSettings>): ConsoleSettings => ({
  version: '0.2.0', hqAddress: 'https://hq.acme.example', onHqMachine: false, installedAt: '2026-10-15T00:00:00.000Z', ...over,
})

describe('the Fleet Console’s compose project @SC-861', () => {
  it('elsewhere: on its own network only, published to 127.0.0.1 on its own port only, dialling HQ’s own address @SC-1254', () => {
    const project = consoleProject(names, settings({}), 'laptop', { hqCode: '4HQWN7TEM9S3' }, chooseSubnets(names, [], []), inst)
    const fleetConsole = project.services.console
    expect(fleetConsole).not.toHaveProperty('network_mode')
    expect(fleetConsole.ports).toEqual(['127.0.0.1:7801:4301'])
    expect(fleetConsole.networks).toEqual(['console'])
    expect(project.networks).toMatchObject({ console: { name: 'agenthix-console' } })
    expect(fleetConsole.environment).toMatchObject({ CONSOLE_HQ_ADDRESS: 'https://hq.acme.example', CONSOLE_LISTEN_HOST: 'container' })
  })

  it('on HQ’s machine: also on HQ’s link network, dialling hq-web by its container name there', () => {
    const project = consoleProject(names, settings({ hqAddress: 'http://127.0.0.1:4100', onHqMachine: true }), 'hq-box', { pairingSecret: 'p'.repeat(64) }, chooseSubnets(names, [], []), inst)
    expect(project.services.console.networks).toEqual(['console', 'link'])
    expect(project.networks).toMatchObject({ console: { name: 'agenthix-console' }, link: { name: 'agenthix-hq-link', external: true } })
    expect(project.services.console.environment.CONSOLE_HQ_ADDRESS).toBe('http://agenthix-hq-web:4100')
  })

  it("names its network so that it sorts before HQ's link network, which Docker would otherwise route it out through", () => {
    for (const ns of ['agenthix', 'acme', 'z']) {
      const n = namesFor(ns)
      const project = consoleProject(n, settings({ onHqMachine: true }), 'hq-box', {}, chooseSubnets(n, [], []), inst)
      expect(Object.values(project.networks).map(v => v.name).sort()).toEqual([n.consoleNetwork, n.hqLinkNetwork])
    }
  })

  it('labels the container with the version it runs as, and with none for a development build', () => {
    const labels = (version: string) => consoleProject(names, settings({ version }), 'laptop', {}, chooseSubnets(names, [], []), inst).services.console.labels
    expect(labels('0.2.0')).toMatchObject({ [names.label('version')]: '0.2.0', [names.label('role')]: 'console' })
    expect(labels('dev')).not.toHaveProperty(names.label('version'))
  })

  it('tells it the version it runs as, which a published image no longer carries, and none for a development build', () => {
    const env = (version: string) => consoleProject(names, settings({ version }), 'laptop', {}, chooseSubnets(names, [], []), inst).services.console.environment
    expect(env('0.2.0').CONSOLE_VERSION).toBe('0.2.0')
    expect(env('dev')).not.toHaveProperty('CONSOLE_VERSION')
  })

  it('keeps its state in a volume it names itself', () => {
    const project = consoleProject(names, settings({}), 'laptop', {}, chooseSubnets(names, [], []), inst)
    expect(project.volumes).toEqual({ state: { name: 'agenthix-console-state' } })
  })

  it('takes no packet claiming its gateway from another network', () => {
    const fleetConsole = consoleProject(names, settings({ onHqMachine: true }), 'hq-box', {}, chooseSubnets(names, [], []), inst).services.console
    expect(fleetConsole.sysctls).toMatchObject({ 'net.ipv4.conf.all.rp_filter': '1' })
  })

  it('names its own network so that Docker routes it out through that network, not HQ’s link network', () => {
    // Docker gives a container on several networks its route out through the first by name; the Fleet Console
    // refuses to start when that is a network HQ is on.
    for (const ns of ['agenthix', 'a', 'acme-hosts', 'z9']) {
      const n = namesFor(ns)
      expect(n.consoleNetwork < n.hqLinkNetwork).toBe(true)
    }
  })

  it('gives its own network the subnet chosen for it, and leaves HQ’s link network to HQ’s project @SC-1158', () => {
    const subnets = chooseSubnets(names, [], [])
    const project = consoleProject(names, settings({ onHqMachine: true }), 'hq-box', {}, subnets, inst)
    expect(project.networks).toEqual({
      console: { name: 'agenthix-console', ipam: { config: [{ subnet: '10.214.0.0/24' }] } },
      link: { name: 'agenthix-hq-link', external: true },
    })
    expect(consoleProject(names, settings({}), 'laptop', {}, subnets, inst).networks)
      .toEqual({ console: { name: 'agenthix-console', ipam: { config: [{ subnet: '10.214.0.0/24' }] } } })
  })
})
