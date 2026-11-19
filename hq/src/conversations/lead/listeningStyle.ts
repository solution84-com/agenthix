/**
 * The listening style as the agent's action (adaptive voice listening, spec §The heavy model → *The listening style as
 * an action*): the person asks to be listened to differently ("stop humming", "let me finish") and the reply calls
 * `set_listening_style`; hq sends the holder's page the style on `listened`, which keeps it for the conversation. The
 * tool's definition is here, so hq's turn and the voice playground offer the same one.
 */
import { z } from 'zod'
import { VOICE_LISTEN_STYLES, type VoiceListenStyle } from '@agenthix/core'
import type { LeadToolDefinition, ToolCallOutcome } from '../contract'

export const SET_LISTENING_STYLE = 'set_listening_style'

export const SET_LISTENING_STYLE_DESCRIPTION =
  'Changes how you listen while the person talks in voice, for the rest of the conversation: hums_off, no small ' +
  'listening sounds such as "mm-hm"; hums_fewer, fewer of them; patient, wait longer before taking their turn as ' +
  'ended and say nothing until it has; normal, all of these undone. Only when they ask.'

export const listeningStyleInput = z.object({
  style: z.enum(VOICE_LISTEN_STYLES).describe('hums_off, hums_fewer, patient, or normal to undo them.'),
})

export function listeningStyleDefinition(): LeadToolDefinition {
  return { name: SET_LISTENING_STYLE, description: SET_LISTENING_STYLE_DESCRIPTION, input: listeningStyleInput }
}

/** The style a call names, or null for anything else. */
export function styleOf(input: unknown): VoiceListenStyle | null {
  const parsed = listeningStyleInput.safeParse(input)
  return parsed.success ? parsed.data.style : null
}

/** What the model is told when nobody is listening in voice. */
export const NOT_LISTENING: ToolCallOutcome = {
  status: 'refused', reason: 'Nobody is talking to you in voice just now, so there is no listening style to change.',
}

/** What the model is told once the style is sent. */
export const styleSet = (turnId: string, style: VoiceListenStyle): ToolCallOutcome =>
  ({ status: 'done', operationId: turnId, result: { style, set: true } })
