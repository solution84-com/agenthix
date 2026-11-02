// Feature flags across hq and the site (adr-0172): every file runs with each flag as shipped (harness/features.ts),
// and withFeature switches one on in hq for its group, through hq's own `setFeature`.
import { describe, expect, it } from 'vitest'
import { FEATURE_FLAG_NAMES } from '../../core/dist/index.js'
import { HQ_URL } from './harness/env'
import { login, op } from './harness/hqApi'
import { onAsShipped } from './harness/features'
import { withFeature } from './harness/withFeature'

async function flagsOn(): Promise<Record<string, boolean>> {
  const token = await login('e2e-admin', 'E2eAdmin!2026')
  const res = await op(HQ_URL, 'get-features', {}, token)
  expect(res.status, JSON.stringify(res.json)).toBe(200)
  return Object.fromEntries((res.json.flags as { flag: string; on: boolean }[]).map(f => [f.flag, f.on]))
}

describe('feature flags in the cross-app tier', () => {
  it('runs each file with every flag as shipped, though hq runs as a development build', async () => {
    const on = await flagsOn()
    for (const flag of FEATURE_FLAG_NAMES) expect(on[flag], flag).toBe(onAsShipped(flag))
  })

  withFeature('usageBilling', () => {
    it("switches the flag on in hq for the group's tests", async () => {
      expect((await flagsOn()).usageBilling).toBe(true)
    })
  })

  it('puts the flag back as shipped after the group', async () => {
    expect((await flagsOn()).usageBilling).toBe(onAsShipped('usageBilling'))
  })
})
