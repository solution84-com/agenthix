import type { ModelChoice, ModelChoices } from '@agenthix/core'

/**
 * When the conversation's model is known to read text only (the model list's `images: false`), what the box says
 * as soon as a picture is added: the model's name, and the first model offered here that does take images (the
 * recommended one, then the recent ones, then the rest) to switch to. Null when the model takes images, or nobody
 * knows: then the picture is sent, and the provider decides.
 */
export function textOnlyModel(choices: ModelChoices | undefined): { model: ModelChoice; switchTo: ModelChoice | null } | null {
  if (!choices?.current) return null
  const all = [...(choices.recommended ?? []), ...choices.recent, ...choices.models]
  const model = all.find(m => m.value === choices.current)
  if (!model || model.images !== false) return null
  return { model, switchTo: all.find(m => m.images === true && !m.notWorking) ?? null }
}
