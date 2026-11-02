/** Live previews' networks are made in the live-preview part of the agents' range, and agents' never are. */
import { describe, expect, it } from 'vitest'
import { allocateSubnet, insideAgentRange, livePreviewPart } from '../../../agents/runtime/containerNetwork'

describe('the live-preview part of the agents\' range @SC-1735', () => {
  it('is the upper /21 of a larger range, and none of a range no larger', () => {
    expect(livePreviewPart('10.213.0.0/20')).toBe('10.213.8.0/21')
    expect(livePreviewPart('10.213.0.0/21')).toBeNull()
  })

  it('takes every live preview\'s network, and no agent\'s', () => {
    const used = new Set<string>()
    for (let i = 0; i < 256; i++) {
      const agent = allocateSubnet(used, '10.213.0.0/20', 'agents')
      expect(insideAgentRange([agent], '10.213.0.0/21')).toBe(true)
      used.add(agent)
    }
    const lp = allocateSubnet(used, '10.213.0.0/20', 'livePreview')
    expect(lp).toBe('10.213.8.0/29')
    expect(insideAgentRange([lp], '10.213.8.0/21')).toBe(true)
  })

  it('leaves agents without room before it gives them the live-preview part', () => {
    const used = new Set<string>()
    for (let i = 0; i < 256; i++) used.add(allocateSubnet(used, '10.213.0.0/20', 'agents'))
    expect(() => allocateSubnet(used, '10.213.0.0/20', 'agents')).toThrow(/no free/)
  })

  it('refuses a live preview where the range has no part for one', () => {
    expect(() => allocateSubnet(new Set(), '10.213.0.0/21', 'livePreview')).toThrow(/too small/)
  })
})
