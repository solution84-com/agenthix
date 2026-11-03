// Before each file: every feature flag as shipped (features.ts), whatever an earlier file left. A file that starts
// with hq not answering (or with no organisation yet) is told so and goes on: it tests nothing a flag holds back.
import { beforeAll } from 'vitest'
import { featuresAsShipped } from './features'

beforeAll(async () => {
  try {
    await featuresAsShipped()
  } catch (err) {
    console.warn(`[harness] feature flags not set as shipped for this file: ${err instanceof Error ? err.message : String(err)}`)
  }
})
