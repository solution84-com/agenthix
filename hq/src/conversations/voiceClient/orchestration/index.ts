/**
 * Orchestration's parts (adaptive voice spec, Orchestration), for the voice session to build its runtime from: the
 * five components, and the adapters to hq's socket and the screen. The speaker (`../adapters/speaker`) carries out
 * its duck, stop and resume. `bargeIn` also makes the person's words theirs (`stt.person`), from what the echo
 * filter kept.
 */
import type { Adapter, AnyComponent } from '../runtime/types'
import { bargeIn } from './bargeIn'
import { floor } from './floor'
import { handRaise } from './handRaise'
import { activeListening } from './activeListening'
import { scheduler } from './scheduler'
import { hqOrchestration, type HqOrchestrationDeps } from '../adapters/hqSocket'
import { screenFeed, type ScreenDeps } from './screen'

export { activeListening, bargeIn, floor, handRaise, scheduler }

export type OrchestrationDeps = HqOrchestrationDeps & ScreenDeps

export function orchestrationParts(deps: OrchestrationDeps): { components: AnyComponent[]; adapters: Adapter[] } {
  return {
    components: [floor, bargeIn, scheduler, handRaise, activeListening],
    adapters: [hqOrchestration(deps), screenFeed(deps)],
  }
}
