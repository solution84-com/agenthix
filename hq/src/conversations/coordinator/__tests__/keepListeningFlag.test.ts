/** keep_listening is the bridge's: under adaptive voice listening the light model judges, so it is never offered. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeatureFlag } from '@agenthix/core'

const on = new Set<FeatureFlag>()
vi.mock('../../../features/switches', () => ({ isOrgFeatureOn: async (flag: FeatureFlag) => on.has(flag) }))

const { keepListeningTool } = await import('../keepListening')
const offered = () => keepListeningTool.offered({ trigger: 'MESSAGE' } as never)

describe('keep_listening, by the flags', () => {
  beforeEach(() => on.clear())

  it('is offered with the bridge on', async () => {
    on.add('voiceBridge')
    expect(await offered()).toBe(true)
  })

  it('is not offered with adaptive voice listening on, whatever the bridge says @SC-2220', async () => {
    on.add('voiceBridge').add('voiceListener')
    expect(await offered()).toBe(false)
  })

  it('is not offered with neither on', async () => {
    expect(await offered()).toBe(false)
  })
})
