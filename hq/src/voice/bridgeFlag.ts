/**
 * The agent's own opening sentence and keep-listening behaviour in voice, behind the flag `voiceBridge` (voice that
 * stays in the conversation). Off, the lead keeps its voice rules in the base instructions, never holds a turn and never
 * opens with an acknowledgement; the client plays one stored phrase at its ceiling in place of the old ladder, flag or not.
 */
import { isOrgFeatureOn } from '../features/switches'

export const VOICE_BRIDGE_FLAG = 'voiceBridge' as const

/** Whether the behaviour is on for this organisation, by the one rule: where it runs asks this first. */
export function voiceBridgeFeatureOn(): Promise<boolean> {
  return isOrgFeatureOn(VOICE_BRIDGE_FLAG)
}
