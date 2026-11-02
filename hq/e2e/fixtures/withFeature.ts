/**
 * `withFeature(flag, test => { … })` for hq's end-to-end specs (adr-0172; live preview spec section 7, *Tests*): before
 * each test in the group the flag is switched on on the test organisation's record, through the *Features* screen's
 * own operation as the e2e administrator, and after it the switch is put back as it was. Everything outside the group
 * runs as the seed left it: as shipped (seed-e2e-users.mjs).
 *
 * The group runs its tests one at a time, since the switch is the organisation's. A spec elsewhere that needs the flag
 * off must not run beside it; keep a feature's hidden-while-off tests in the same file, outside the group.
 *
 * For a flag at experimental, a failing test is recorded with core's experimental-failure record and marked skipped
 * with a note, so the run passes; `playwright.config.ts` prints the summary when the run ends. From preview on, it
 * fails as any other. Write the group's tests with the `test` the body is given, so that applies to them.
 */
import { test as base, type TestInfo } from '@playwright/test'
import { stageOf, type FeatureFlag } from '@agenthix/core'
import { recordExperimentalFailure } from '@agenthix/core/testing'
import { adminOperations } from './standInModel'

type Base = typeof base
type Row = { flag: FeatureFlag; on: boolean }

async function switchFeature(request: Parameters<typeof adminOperations>[0], flag: FeatureFlag, on: boolean): Promise<boolean> {
  const call = await adminOperations(request)
  if (!call) throw new Error(`withFeature(${flag}): the e2e administrator could not sign in`)
  const before = ((await call('get-features', undefined)) as { flags: Row[] }).flags.find(f => f.flag === flag)?.on ?? false
  await call('set-feature', { flag, on })
  return before
}

/** A test whose failure is recorded and turned into a skip: the group's tests of an experimental flag. */
function experimentalTest(flag: FeatureFlag): Base {
  const guarded = (title: string, body: (args: never, info: TestInfo) => Promise<void> | void) =>
    base(title, async (args, info) => {
      try {
        await body(args as never, info)
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        recordExperimentalFailure({ flag, test: [...info.titlePath].join(' > '), error })
        info.skip(true, `Experimental failure (${flag}): ${error.split('\n')[0]}`)
      }
    })
  // The other members (beforeEach, describe, expect…) are Playwright's own; only a test's body is guarded.
  return Object.assign(guarded, base) as unknown as Base
}

export function withFeature(flag: FeatureFlag, body: (test: Base) => void): void {
  base.describe(`with the ${flag} feature on`, () => {
    base.describe.configure({ mode: 'default' })
    let before = false
    base.beforeEach(async ({ request }) => { before = await switchFeature(request, flag, true) })
    base.afterEach(async ({ request }) => { await switchFeature(request, flag, before) })
    body(stageOf(flag) === 'experimental' ? experimentalTest(flag) : base)
  })
}
