import { describe, expect, it } from 'vitest'
import { parseFeatureSwitches, type FeatureSwitches } from '../../shared/featureFlags.js'
import type { ChannelRequestPayload, FeatureSwitchesOnWire } from '../channelMessages.js'

describe('the switches on a request to a site (site protocol 1.12) @SC-1762', () => {
  it('carries hq\'s typed switches, and the site reads back only what it lists', () => {
    const held: FeatureSwitches = { marketplace: true, usageBilling: false }
    const payload: ChannelRequestPayload = { method: 'site.describe', params: {}, features: held }
    const received = JSON.parse(JSON.stringify(payload)) as { features?: unknown }
    expect(parseFeatureSwitches(received.features)).toEqual(held)
  })

  it('is optional: a request without it gives the site no switches', () => {
    const payload: ChannelRequestPayload = { method: 'site.describe', params: {} }
    expect(parseFeatureSwitches((payload as { features?: FeatureSwitchesOnWire }).features)).toEqual({})
  })

  it('stays open-ended on the wire, so a name core does not list is no break, only dropped', () => {
    const wire: FeatureSwitchesOnWire = { someFlagFromANewerHq: true, marketplace: true }
    expect(parseFeatureSwitches(wire)).toEqual({ marketplace: true })
  })
})
