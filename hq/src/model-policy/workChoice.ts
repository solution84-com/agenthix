/**
 * The model a piece of work runs on and the runtime that can be given it, from its boundary's effective policy: a
 * conversation's worker (conversations/work/workers) and a task's run (agents/taskRunModel.ts) choose alike.
 */
import { OPENCODE_RUNTIME, isKnownModel } from '@agenthix/core'
import type { EffectiveModelPolicy } from '../conversations/contract'

export type Effort = 'light' | 'heavy'
export type WorkChoice = { model: string | null; runtime: string }

/**
 * The boundary's light- or heavy-work model on the agent's runtime when it offers it, else on OpenCode when that can
 * be given it (a model only an OpenRouter, OpenAI, Google or own-endpoint key reaches), else no model — the agent's
 * own, on its own runtime.
 */
export function workChoice(policy: EffectiveModelPolicy, effort: Effort, runtime: string): WorkChoice {
  const model = effort === 'heavy' ? policy.heavyWork : policy.lightWork
  if (model && isKnownModel(runtime, model)) return { model, runtime }
  if (model && isKnownModel(OPENCODE_RUNTIME, model)) return { model, runtime: OPENCODE_RUNTIME }
  return { model: null, runtime }
}
