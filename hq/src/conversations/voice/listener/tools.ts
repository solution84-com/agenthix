/**
 * The light model's five tools (adaptive voice listening, spec §The five tools). It calls exactly one; when it is asked
 * again is hq's. The same shape is the JSON variant's object, with the tool's name in `action`. It has no `hum`: the
 * small sounds of listening are the backchannel's, played in the browser without a call (spec §The backchannel), so a
 * `hum` a model still sends is an unknown tool, read as `keep_listening`.
 */
import { z } from 'zod'
import { VOICE_HUM_TONES } from '@agenthix/core'
import type { LeadToolDefinition } from '../../contract'
import { REASON_MAX_WORDS } from './instructions'

export const LISTENER_TOOLS = ['keep_listening', 'acknowledge', 'invite', 'close_turn', 'hand_over'] as const
export type ListenerToolName = (typeof LISTENER_TOOLS)[number]

/** The tools that end a turn: only a *sounds finished* call may use them. */
export const ENDS_TURN: ReadonlySet<ListenerToolName> = new Set(['close_turn', 'hand_over'])

/** The tools whose words are one line in `say`. */
export const SAYS: ReadonlySet<ListenerToolName> = new Set(['acknowledge', 'invite', 'close_turn'])

export function isListenerTool(name: string): name is ListenerToolName {
  return (LISTENER_TOOLS as readonly string[]).includes(name)
}

const say = (cap: number, what: string) => z.string().describe(`${what} At most ${cap} words, your own words each time.`)

/** How the line sounds (spec §Tone); calm when absent. */
const tone = z.enum(VOICE_HUM_TONES).optional()
  .describe('How your voice sounds saying the line: calm (the default), warm, curious, thoughtful, gentle or bright.')

export interface ToolCaps { acknowledge: number; invite: number; close_turn: number; hold: number; answer: number }

const DESCRIPTIONS: Record<ListenerToolName, string> = {
  keep_listening: 'Say nothing and keep listening. The default: they are still talking or thinking, or nothing needs saying.',
  acknowledge: 'A short "got it" while they talk, or, while the answer is being worked out, a short line asking them to bear with you.',
  invite: 'A gentle word in a silence that calls for one, to let them know you are listening.',
  close_turn: 'They have finished and your short line is the whole reply: nothing to know, decide or do. Only when the call says they sound finished.',
  hand_over: 'They have finished and the reply needs anything at all: a fact, an opinion, a decision, an action, something to remember. Only when the call says they sound finished.',
}

export function listenerToolInputs(caps: ToolCaps, opts: { withAnswer: boolean; withReason?: boolean }): Record<ListenerToolName, z.ZodObject> {
  const inputs = {
    keep_listening: z.object({}),
    acknowledge: z.object({ say: say(caps.acknowledge, 'The line.'), tone }),
    invite: z.object({ say: say(caps.invite, 'The line.'), tone }),
    close_turn: z.object({ say: say(caps.close_turn, 'The line that closes the turn.'), tone }),
    hand_over: z.object({
      asked: z.string().describe('What they want, in a few words, for example "the weather in Melbourne".'),
      ...(opts.withAnswer
        ? { answer: z.string().describe(`The answer you would give, in one short sentence of at most ${caps.answer} words: the gist, never the working-out. Nobody hears it; put it here so it stays out of the hold.`) }
        : {}),
      hold: say(caps.hold, 'What they hear while the answer is worked out.'),
      tone,
    }),
  }
  if (!opts.withReason) return inputs
  // The reason is the first field, so it is written before the choice's words.
  const why = z.string().optional().describe(`A reason in at most ${REASON_MAX_WORDS} words: what led to this choice. Never spoken.`)
  return Object.fromEntries(Object.entries(inputs).map(([name, o]) => [name, z.object({ why, ...o.shape })])) as unknown as Record<ListenerToolName, z.ZodObject>
}

export function listenerToolDefinitions(caps: ToolCaps, opts: { withAnswer: boolean; withReason?: boolean }): LeadToolDefinition[] {
  const inputs = listenerToolInputs(caps, opts)
  return LISTENER_TOOLS.map(name => ({ name, description: DESCRIPTIONS[name], input: inputs[name] }))
}
