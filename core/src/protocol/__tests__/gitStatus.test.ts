import { describe, it, expect } from 'vitest'
import { GIT_STATUS_SITE_BUDGET_MS, GIT_STATUS_TIMEOUT_MS } from '../gitStatus.js'

describe('git.status budgets @SC-1465', () => {
  it('gives the site less than hq waits, so the site stops a slow read and says so', () => {
    expect(GIT_STATUS_SITE_BUDGET_MS).toBeLessThan(GIT_STATUS_TIMEOUT_MS)
    expect(GIT_STATUS_TIMEOUT_MS - GIT_STATUS_SITE_BUDGET_MS).toBeGreaterThanOrEqual(5_000)
  })
})
