import { afterEach, describe, expect, it } from 'vitest'
import { ADDRESS_BLOCKS, AGENT_SLICE_BITS } from '@agenthix/core'
import { agentRangesOfOthers, chooseAgentSlice, keepAgentSlice, pickAgentSlice } from '../agentSlice'
import { overlaps, SubnetsExhausted } from '../subnets'
import { fakeMachine, type FakeMachine } from '../../__tests__/fakeMachine'
import { readInstallation, recordAgentRange } from '../../state/installation'

const slice = (n: number) => `10.213.${n * 16}.0/${AGENT_SLICE_BITS}`

describe('choosing an installation’s agent slice @SC-1246', () => {
  it('takes the first /20 of the agents’ block when nothing uses it', () => {
    expect(chooseAgentSlice([], [], [])).toBe(slice(0))
    expect(overlaps(slice(0), ADDRESS_BLOCKS.agents)).toBe(true)
  })

  it('skips Docker networks, the machine’s own addresses and other installations’ slices', () => {
    expect(chooseAgentSlice([{ name: 'other', subnets: ['10.213.3.8/29'] }], [], [])).toBe(slice(1))
    expect(chooseAgentSlice([], ['10.213.20.4/24'], [])).toBe(slice(0))
    expect(chooseAgentSlice([], ['10.213.4.1/24'], [{ namespace: 'mobiletest', range: slice(1) }])).toBe(slice(2))
  })

  it('refuses when no slice is left, naming who holds them', () => {
    const others = Array.from({ length: 15 }, (_, i) => ({ namespace: `test${i}`, range: slice(i) }))
    expect(chooseAgentSlice([], [], others)).toBe(slice(15))
    const full = () => chooseAgentSlice([{ name: 'wide', subnets: ['10.213.240.0/22'] }], [], others)
    expect(full).toThrow(SubnetsExhausted)
    expect(full).toThrow(/test0, test1/)
    expect(full).toThrow(/Nothing was changed\.$/)
  })
})

describe('other installations’ slices, from their labels @SC-1246 @SC-1248', () => {
  it('reads every <namespace>.agent-range but this installation’s own', () => {
    const containers: Record<string, string>[] = [
      { 'mobiletest.role': 'site', 'mobiletest.ports': '7500,7520', 'mobiletest.agent-range': '10.213.16.0/20' },
      { 'agenthix.role': 'site', 'agenthix.agent-range': '10.213.0.0/20' },
      { 'com.docker.compose.project': 'x' },
    ]
    expect(agentRangesOfOthers(containers, 'agenthix')).toEqual([{ namespace: 'mobiletest', range: '10.213.16.0/20' }])
  })
})

describe('the slice at a site’s first install @SC-1246', () => {
  let m: FakeMachine
  afterEach(() => m.cleanup())

  it('is picked from what Docker and the other installations hold, and nothing is written', async () => {
    m = fakeMachine()
    m.dockerNetworks.push({ name: 'someone', subnets: ['10.213.0.0/24'] })
    m.machineContainers.push({ name: 'mobiletest-site', labels: { 'mobiletest.role': 'site', 'mobiletest.agent-range': '10.213.16.0/20' }, running: true, published: [] })
    expect(await pickAgentSlice({ ...m.ctx, machineAddresses: () => [] })).toBe(slice(2))
    expect(readInstallation(m.ctx.state)!.agentRange).toBeNull()
  })

  it('is read back once recorded, and never picked again', async () => {
    m = fakeMachine()
    recordAgentRange(m.ctx.state, slice(5))
    m.dockerNetworks.push({ name: 'later', subnets: [slice(5)] })
    expect(await pickAgentSlice(m.ctx)).toBe(slice(5))
    expect(m.calls.some(c => c[0] === 'network' || c[0] === 'ps')).toBe(false)
  })

  it('is recorded once kept, and the rest of the record stays', async () => {
    m = fakeMachine()
    keepAgentSlice(m.ctx.state, await pickAgentSlice({ ...m.ctx, machineAddresses: () => [] }))
    expect(readInstallation(m.ctx.state)).toMatchObject({ namespace: 'agenthix', agentRange: slice(0) })
  })
})
