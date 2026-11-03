/**
 * `withFeature(flag, () => { … })` for vitest unit tests (adr-0172): a feature's own tests, switched on in memory for
 * their group and off after each test. Everything outside the group runs as shipped.
 *
 * A failing test in the group of a flag at `experimental` is recorded (experimentalFailures.ts) and reported as
 * skipped, with a note, so it does not fail the run; from `preview` on it fails as any other.
 *
 * It uses the test runner's globals (`describe`, `beforeEach`, `afterEach`: vitest's `globals: true`) rather than
 * importing vitest, because core is linked into each module and an import from here would reach core's own copy of
 * vitest, not the one running the module's tests.
 */
import { FEATURE_FLAGS, type FeatureFlag, type FeatureStage } from '../shared/featureFlags.js'
import { switchOffForTest, switchOnForTest } from '../shared/featureTestSwitches.js'
import { recordExperimentalFailure } from './experimentalFailures.js'

type TaskName = { name: string; suite?: TaskName; file?: TaskName }

type TestContext = {
  task: TaskName & { result?: { state?: string; errors?: ReadonlyArray<{ message?: string }> } }
  skip(note: string): never
  onTestFinished(fn: (context: TestContext) => void): void
}

type TestGlobals = {
  describe(name: string, body: () => void): void
  beforeEach(fn: (context: TestContext) => void): void
  afterEach(fn: (context: TestContext) => void): void
}

function testGlobals(): TestGlobals {
  const g = globalThis as Partial<TestGlobals>
  if (typeof g.describe !== 'function' || typeof g.beforeEach !== 'function' || typeof g.afterEach !== 'function') {
    throw new Error('withFeature needs the test runner\'s globals: set `globals: true` in the module\'s vitest config.')
  }
  return g as TestGlobals
}

/** The file, then each group, then the test, as `a > b > c`. */
function fullName(task: TaskName): string {
  const names: string[] = [task.name]
  for (let s = task.suite; s && s !== task.file; s = s.suite) if (s.name) names.unshift(s.name)
  if (task.file?.name) names.unshift(task.file.name)
  return names.join(' > ')
}

/** The group for a flag at a given stage. Exported for core's own tests, which need a flag the list does not hold. */
export function withFeatureAt(flag: string, stage: FeatureStage, body: () => void): void {
  const { describe, beforeEach, afterEach } = testGlobals()
  describe(`with the ${flag} feature on`, () => {
    beforeEach(context => {
      switchOnForTest(flag)
      if (stage !== 'experimental') return
      context.onTestFinished(finished => {
        if (finished.task.result?.state !== 'fail') return
        const error = finished.task.result.errors?.[0]?.message ?? 'failed'
        recordExperimentalFailure({ flag, test: fullName(finished.task), error })
        finished.skip(`Experimental failure (${flag}): ${error.split('\n')[0]}`)
      })
    })
    afterEach(() => switchOffForTest(flag))
    body()
  })
}

export function withFeature(flag: FeatureFlag, body: () => void): void {
  withFeatureAt(flag, FEATURE_FLAGS[flag].stage, body)
}
