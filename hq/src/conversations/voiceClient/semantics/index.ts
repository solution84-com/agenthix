/**
 * Semantics' parts for the runtime: the pause timer with the decision rule, and the turn adapter. Without a model
 * of its own, the turn adapter takes the page's shared models' worker (the one silence detection uses) when voice
 * starts, and gives it back when voice stops.
 */
import { sharedWorkerModels } from '../models/sharedModels'
import type { TurnModel } from '../ports'
import type { Adapter, AnyComponent } from '../runtime/types'
import { pauseTimer } from './pause'
import { turnAdapter } from './turnAdapter'

export type SemanticsDeps = { model?: TurnModel }

function sharedTurnAdapter(): Adapter {
  return {
    name: 'turnAdapter',
    start(runtime) {
      const models = sharedWorkerModels()
      const stop = turnAdapter({ model: () => models.turn }).start(runtime)
      return () => { stop(); models.release() }
    },
  }
}

export function semanticsParts(deps: SemanticsDeps = {}): { components: AnyComponent[]; adapters: Adapter[] } {
  const model = deps.model
  return {
    components: [pauseTimer],
    adapters: [model ? turnAdapter({ model: () => model }) : sharedTurnAdapter()],
  }
}
