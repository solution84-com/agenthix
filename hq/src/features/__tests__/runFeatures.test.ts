import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/server', () => ({ prisma: { org: { findFirst: async () => null } } }))

import { instructionsFor, runFeatures, runFeaturesFrom, type FlaggedTools } from '../runFeatures'

const production = { NODE_ENV: 'production' }
const flagged: FlaggedTools = { marketplace: ['browse_marketplace', 'install_from_marketplace'] }

describe("a run's tools and instructions by flag", () => {
  it("withholds a feature's tools while it is off", () => {
    const off = runFeaturesFrom({ env: production, switches: {} }, flagged)
    expect(off.isOn('marketplace')).toBe(false)
    expect(off.withheldTools).toEqual(['browse_marketplace', 'install_from_marketplace'])
  })

  it('gives them while it is on', () => {
    const on = runFeaturesFrom({ env: { NODE_ENV: 'development' }, switches: {} }, flagged)
    expect(on.isOn('marketplace')).toBe(true)
    expect(on.withheldTools).toEqual([])
  })

  it('cannot be turned on in production by a switch for a flag at preview', () => {
    expect(runFeaturesFrom({ env: production, switches: { marketplace: true } }, flagged).withheldTools).toHaveLength(2)
  })

  it("writes a feature's instructions only while it is on", () => {
    const parts = [{ text: 'Always.' }, { flag: 'marketplace' as const, text: 'About the Marketplace.' }]
    expect(instructionsFor(runFeaturesFrom({ env: production, switches: {} }), parts)).toEqual(['Always.'])
    expect(instructionsFor(runFeaturesFrom({ env: { NODE_ENV: 'development' }, switches: {} }), parts))
      .toEqual(['Always.', 'About the Marketplace.'])
  })

  it("asks the rule with the organisation's switches; a test run is as shipped", async () => {
    expect((await runFeatures(flagged)).withheldTools).toEqual(['browse_marketplace', 'install_from_marketplace'])
  })

  it("withholds the live preview's app tools and the lead's offer of one while its flag is off", async () => {
    expect([...(await runFeatures()).withheldTools].sort()).toEqual(
      ['list_apps', 'offer_live_preview', 'reload_view', 'set_auto_reload', 'start_app', 'stop_app'],
    )
  })
})
