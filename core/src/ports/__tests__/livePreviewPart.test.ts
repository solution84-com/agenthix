import { describe, expect, it } from 'vitest'
import { ADDRESS_BLOCKS, AGENT_CONTAINER_BITS, AGENT_SLICE_BITS, LIVE_PREVIEW_PART_BITS } from '../ports.js'
import { livePreviewPartOf } from '../livePreviewPart.js'

const asNumber = (a: string) => a.split('.').reduce((n, p) => n * 256 + Number(p), 0)
function block(cidr: string) {
  const [address, bits] = cidr.split('/')
  const start = asNumber(address)
  return { start, end: start + 2 ** (32 - Number(bits)) - 1 }
}

describe('the live-preview part of the agent slice @SC-1735', () => {
  it("is the upper half of an installation's slice", () => {
    expect(LIVE_PREVIEW_PART_BITS).toBe(AGENT_SLICE_BITS + 1)
    expect(livePreviewPartOf('10.213.16.0/20')).toBe('10.213.24.0/21')
    expect(livePreviewPartOf('10.213.0.0/20')).toBe('10.213.8.0/21')
  })

  it('lies inside the slice', () => {
    const slice = block(`10.213.240.0/${AGENT_SLICE_BITS}`)
    const part = block(livePreviewPartOf(`10.213.240.0/${AGENT_SLICE_BITS}`)!)
    expect(part.start).toBeGreaterThanOrEqual(slice.start)
    expect(part.end).toBe(slice.end)
    expect(part.end).toBeLessThanOrEqual(block(ADDRESS_BLOCKS.agents).end)
  })

  it('holds 64 live previews, each with its own network and a /28 for its services, with room to spare', () => {
    expect(2 ** (AGENT_CONTAINER_BITS - LIVE_PREVIEW_PART_BITS)).toBe(256)
    const perPreview = 2 ** (32 - AGENT_CONTAINER_BITS) + 2 ** (32 - 28)
    expect(2 ** (32 - LIVE_PREVIEW_PART_BITS)).toBeGreaterThanOrEqual(64 * perPreview)
  })

  it('is the top of a larger range, as in development', () => {
    expect(livePreviewPartOf(ADDRESS_BLOCKS.devAgents)).toBe('10.212.248.0/21')
  })

  it('refuses a range that is not one, or smaller than a live-preview part', () => {
    for (const bad of ['10.213.16.0/22', '10.213.17.0/20', '10.213.16.0', '300.0.0.0/20', 'x/20', '10.213.16.0/33'])
      expect(livePreviewPartOf(bad), bad).toBeNull()
  })
})
