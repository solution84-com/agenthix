/**
 * Which voice turn block a turn the person hears is given, by the flags on: the bridge's (`voiceBridge`: judging,
 * holding, the opening sentence), adaptive voice listening's (`voiceListener`, whatever the bridge says: only how to
 * speak, since the light model judges and holds, and with Tone on the reply's tone tag), or none — the older
 * listening block.
 */
import type { FeatureFlag } from '@agenthix/core'
import type { VoiceBlockOptions } from './context'

export function voiceBlockOf(
  featuresOn: readonly FeatureFlag[] | undefined,
  listening: { adaptiveVoice?: boolean; wentOnAfterHold?: boolean; toneOn?: boolean } | null,
): VoiceBlockOptions | null {
  if (featuresOn?.includes('voiceListener')) {
    // Tone is the light model's world: with Adaptive voice off the session is plain voice, spoken calm.
    const adaptiveVoice = listening?.adaptiveVoice ?? true
    return { adaptiveVoice, wentOnAfterHold: false, listener: true, ...(adaptiveVoice && listening?.toneOn && { toneTag: true }) }
  }
  if (!featuresOn?.includes('voiceBridge')) return null
  return { adaptiveVoice: listening?.adaptiveVoice ?? true, wentOnAfterHold: listening?.wentOnAfterHold ?? false }
}
