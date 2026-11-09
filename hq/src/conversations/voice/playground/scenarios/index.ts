/**
 * The playground's scenario library (plan task 4c.3): 84 fixed scenarios in four groups, text only, built from the
 * labelled sets the voice turn block was measured on. Nothing changes them at runtime: every run is the same 84, so
 * one run's scores compare with the next.
 */
import type { ScenarioGroup } from '../../../../shared/voicePlayground'
import { FINISHED } from './finished'
import { QUICK } from './quick'
import { TASKS } from './tasks'
import { TRAILS_OFF } from './trailsOff'

function frozen<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) frozen(v)
    Object.freeze(value)
  }
  return value
}

export const SCENARIO_GROUPS: readonly ScenarioGroup[] = frozen([
  { id: 'hold', title: 'Person trails off: the agent should stay quiet', scenarios: TRAILS_OFF },
  { id: 'reply', title: 'Person has finished: the agent should answer', scenarios: FINISHED },
  { id: 'quick', title: 'Quick questions: answer at once', scenarios: QUICK },
  { id: 'task', title: 'Tasks: say it will do it, then start', scenarios: TASKS },
])

export const ALL_SCENARIOS = SCENARIO_GROUPS.flatMap(g => g.scenarios)
