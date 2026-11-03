/**
 * `withFeature(flag, () => { … })` for the cross-app tier (adr-0172): the flag is switched on for the test
 * organisation in hq before each test of the group, and back to its value as shipped after. hq sends the switches to
 * the site with each instruction, so a run started inside the group is checked with the flag on, there too.
 *
 * As in core's unit-test form, a failing test in the group of a flag at `experimental` is recorded in the shared
 * record of experimental failures and reported as skipped, so it does not fail the run; from `preview` on it fails.
 */
import { afterEach, beforeEach, describe } from 'vitest'
import { stageOf, type FeatureFlag } from '../../../core/dist/index.js'
import { recordExperimentalFailure } from '../../../core/dist/testing/index.js'
import { onAsShipped, setOrgFeature } from './features'

type Task = { name: string; suite?: Task; file?: Task }

function fullName(task: Task): string {
  const names = [task.name]
  for (let s = task.suite; s && s !== task.file; s = s.suite) if (s.name) names.unshift(s.name)
  if (task.file?.name) names.unshift(task.file.name)
  return names.join(' > ')
}

export function withFeature(flag: FeatureFlag, body: () => void): void {
  const experimental = stageOf(flag) === 'experimental'
  describe(`with the ${flag} feature on`, () => {
    beforeEach(async context => {
      await setOrgFeature(flag, true)
      if (!experimental) return
      context.onTestFinished(finished => {
        if (finished.task.result?.state !== 'fail') return
        const error = finished.task.result.errors?.[0]?.message ?? 'failed'
        recordExperimentalFailure({ flag, test: fullName(finished.task), error })
        finished.skip(`Experimental failure (${flag}): ${error.split('\n')[0]}`)
      })
    })
    afterEach(async () => {
      await setOrgFeature(flag, onAsShipped(flag))
    })
    body()
  })
}

/**
 * `withFeatureOff(flag, () => { … })`: the group's tests run with the flag switched off, whatever the run's default, and
 * the switch goes back to its value as shipped after each. For the tests that check a feature hidden and refused while
 * off: they protect the release, so they always block, and still hold in the run with every flag on.
 */
export function withFeatureOff(flag: FeatureFlag, body: () => void): void {
  describe(`with the ${flag} feature off`, () => {
    beforeEach(async () => { await setOrgFeature(flag, false) })
    afterEach(async () => { await setOrgFeature(flag, onAsShipped(flag)) })
    body()
  })
}
