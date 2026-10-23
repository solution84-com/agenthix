import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { install } from '../../install/install'
import { installManagedSite } from '../../install/managedSite'
import type { ConsolePin } from '../../link/pin'
import { Refusal } from '../../owner/results'
import { readInstallation } from '../../state/installation'

let m: FakeMachine
beforeEach(() => { m = fakeMachine() })
afterEach(() => m.cleanup())

const run = () => install(m.ctx, { address: 'https://hq.acme.example' }, () => {})
const siteEnv = () => JSON.parse(fs.readFileSync(m.ctx.state.path('site', 'compose.json'), 'utf8')).services.site.environment
/** Every /20 of the agents' block but the last, held by test installations; the last by a Docker network. */
const allTaken = () => {
  for (let i = 0; i < 15; i++) m.machineContainers.push({ name: `t${i}-site`, labels: { [`t${i}.role`]: 'site', [`t${i}.agent-range`]: `10.213.${i * 16}.0/20` }, running: true, published: [] })
  m.dockerNetworks.push({ name: 'wide', subnets: ['10.213.240.0/20'] })
}

describe('the agent slice at install on HQ’s machine @SC-1246', () => {
  it('is picked, recorded, and given to the site as its agents’ range', async () => {
    m.machineContainers.push({ name: 'mobiletest-site', labels: { 'mobiletest.role': 'site', 'mobiletest.agent-range': '10.213.0.0/20' }, running: true, published: [] })
    await run()
    expect(readInstallation(m.ctx.state)!.agentRange).toBe('10.213.16.0/20')
    expect(siteEnv().AGENT_NETWORK_RANGE).toBe('10.213.16.0/20')
  })

  it('is kept when install runs again, whatever came to use it since', async () => {
    await run()
    m.dockerNetworks.push({ name: 'since', subnets: ['10.213.0.0/24'] })
    await run()
    expect(siteEnv().AGENT_NETWORK_RANGE).toBe('10.213.0.0/20')
  })

  it('refuses before fetching or writing anything when no slice is left', async () => {
    allTaken()
    const refused = await run().catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(Refusal)
    expect((refused as Refusal).message).toMatch(/^No address range is left for this installation's agents: .*Nothing was changed\.$/)
    expect(m.calls.filter(c => c[0] === 'pull' || (c[0] === 'compose' && c.includes('up')))).toEqual([])
    expect(fs.existsSync(m.ctx.state.path('hq', 'settings.json'))).toBe(false)
    expect(readInstallation(m.ctx.state)).toMatchObject({ agentRange: null, ports: { hq: null, console: null } })
  })
})

describe('the agent slice when a Fleet Console adds a site to a machine @SC-1246', () => {
  const pin = { local: false, hqAddress: 'https://hq.acme.example' } as ConsolePin
  const add = () => installManagedSite(m.ctx, { version: m.ctx.machine.hostServiceVersion }, pin, () => {})

  it('is picked and given to the site', async () => {
    m.dockerNetworks.push({ name: 'someone', subnets: ['10.213.4.0/24'] })
    await add()
    expect(readInstallation(m.ctx.state)!.agentRange).toBe('10.213.16.0/20')
    expect(siteEnv().AGENT_NETWORK_RANGE).toBe('10.213.16.0/20')
  })

  it('refuses before fetching or writing anything when no slice is left', async () => {
    allTaken()
    await expect(add()).rejects.toThrow(/^No address range is left for this installation's agents/)
    expect(m.calls.filter(c => c[0] === 'pull')).toEqual([])
    expect(fs.existsSync(m.ctx.state.path('site', 'settings.json'))).toBe(false)
  })
})
