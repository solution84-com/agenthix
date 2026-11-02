// The live preview behind its flag across hq, its site and the Fleet Console (adr-0172): as shipped it is off, so the
// Fleet Console is told it is not on and a fleet admin's live-preview methods are refused, nothing changed; inside its
// own group hq switches it on for the organisation, answers them, and sends the site its setting with the switches,
// which the site (a development build here) takes.
//
// Runs on the pair an earlier file left, or alone (`npx vitest run 14-live-preview-flag`), pairing its own default site.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hqDb } from './harness/db'
import { runHqMachineCommand } from './harness/hqMachine'
import { ensureDefaultSite } from './harness/knowledgeSetup'
import { StandInConsole } from './harness/fleetConsole'
import { withFeature } from './harness/withFeature'

let fleetConsole: StandInConsole
let byUserId: string
let executionSiteId: string

beforeAll(async () => {
  await ensureDefaultSite()
  // The fleet admin role, granted on hq's machine as the machine admin does; granting it again changes nothing.
  const granted = await runHqMachineCommand('fleet-admin', ['e2e-admin'])
  if (!granted.ok) throw new Error(`fleet-admin e2e-admin: ${granted.error}`)
  byUserId = (granted.data as { userId: string }).userId
  executionSiteId = (await hqDb.executionSite.findFirstOrThrow({ where: { isDefault: true, status: 'ONLINE' }, select: { id: true } })).id
  fleetConsole = await StandInConsole.connect()
}, 300_000)

afterAll(() => {
  fleetConsole?.close()
})

const setting = () => ({ byUserId, executionSiteId, allowed: true, limit: null, idleMinutes: 120 })

describe('the live preview as shipped: off', () => {
  it('is not among the features hq tells the Fleet Console are on', async () => {
    const { on } = await fleetConsole.call('features.on', {})
    expect(on).not.toContain('livePreview')
  })

  it("refuses a fleet admin's live-preview methods, and changes nothing", async () => {
    const before = await hqDb.executionSite.findUniqueOrThrow({ where: { id: executionSiteId } })
    for (const [method, params] of [
      ['sites.livePreviews', { byUserId, executionSiteId }],
      ['sites.livePreviews.set', { ...setting(), idleMinutes: 30 }],
      ['sites.livePreviews.stop', { byUserId, executionSiteId, livePreviewId: 'lp-none' }],
    ] as const) {
      const answer = await fleetConsole.ask(method, params)
      expect(answer.ok, method).toBe(false)
    }
    const after = await hqDb.executionSite.findUniqueOrThrow({ where: { id: executionSiteId } })
    expect(after.livePreviewIdleMinutes).toBe(before.livePreviewIdleMinutes)
  })
})

withFeature('livePreview', () => {
  describe('the live preview switched on for the organisation', () => {
    it('is among the features on, and its methods are answered through to the site', async () => {
      const { on } = await fleetConsole.call('features.on', {})
      expect(on).toContain('livePreview')
      const { view } = await fleetConsole.call('sites.livePreviews.set', setting())
      expect(view).toMatchObject({ executionSiteId, allowed: true, idleMinutes: 120 })
      expect(await fleetConsole.call('sites.livePreviews', { byUserId, executionSiteId })).toMatchObject({ executionSiteId, allowed: true })
    })
  })
})
