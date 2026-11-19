/** The light model the playground runs: the one chosen, else DeepSeek Flash on OpenRouter when offered, else hq's own choice. */
import type { ModelChoices } from '../../../shared/conversations/protocol'
import { HQ_LISTENER_CHOICE } from '../../../shared/voicePlaygroundLight'

/** DeepSeek Flash on OpenRouter, the measured baseline: the light model when none is chosen and the picker offers it. */
export const BASELINE_LIGHT_MODEL = '~deepseek/deepseek-flash-latest'

/**
 * The light model the page runs: the one chosen, else the baseline when offered, else null (hq's own choice). A choice the
 * picker does not offer is not run (`staleModels.ts` also replaces it): it runs as if none were chosen.
 */
export function effectiveListenerModel(chosen: string | null, choices: ModelChoices | undefined): string | null {
  if (chosen === HQ_LISTENER_CHOICE) return null
  if (chosen && (!choices || choices.models.some(m => m.value === chosen && !m.notWorking))) return chosen
  return choices?.models.find(m => m.value.endsWith(`/${BASELINE_LIGHT_MODEL}`) && !m.notWorking)?.value ?? null
}
