/**
 * Orchestration's parts (adaptive voice spec, Orchestration), for the voice session to build its runtime from: the
 * five components, the light model's listening runtime (`../listener/trigger`), the backchannel
 * (`../backchannel/trigger`), its listening read (`../backchannel/service`) and its sound keeper (`../backchannel/keeper`), adaptive pacing (`../pacing`) and its
 * memory for the conversation, and the adapters to hq's socket
 * and the screen. The speaker (`../adapters/speaker`) carries out its duck, stop and resume. `bargeIn` also makes the
 * person's words theirs (`stt.person`), from what the echo filter kept.
 */
import type { Adapter, AnyComponent } from '../runtime/types'
import { bargeIn } from './bargeIn'
import { floor } from './floor'
import { handRaise } from './handRaise'
import { listening } from './listening'
import { scheduler } from './scheduler'
import { hqOrchestration, type HqOrchestrationDeps } from '../adapters/hqSocket'
import { hqListening } from '../adapters/hqListening'
import { listenerTrigger } from '../listener/trigger'
import { backchannel } from '../backchannel/trigger'
import { humService } from '../backchannel/service'
import { keeper } from '../backchannel/keeper'
import { hqBackchannel } from '../adapters/hqBackchannel'
import { voiceHint } from '../tone/voiceHint'
import { screenFeed, type ScreenDeps } from './screen'
import { pace } from '../pacing/component'
import { paceMemory } from '../pacing/memory'

export { bargeIn, floor, handRaise, listening, scheduler }

export type OrchestrationDeps = HqOrchestrationDeps & ScreenDeps

export function orchestrationParts(deps: OrchestrationDeps): { components: AnyComponent[]; adapters: Adapter[] } {
  return {
    components: [floor, bargeIn, scheduler, handRaise, listening, listenerTrigger, humService, voiceHint, backchannel, keeper, pace],
    adapters: [hqOrchestration(deps), hqListening(deps), hqBackchannel(deps), screenFeed(deps), paceMemory(deps)],
  }
}
