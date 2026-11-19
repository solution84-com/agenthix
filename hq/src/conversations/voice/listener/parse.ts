/**
 * Reads the light model's answer (a tool call, or the JSON variant's one object) into one decision, and applies the
 * mechanical rules (spec §The five tools): exactly one tool and no text beside it; `close_turn` and `hand_over` only in
 * a *sounds finished* call; every spoken line within its cap, or dropped whole. Anything that breaks a rule is
 * `keep_listening`, with the reason kept for the log and the measurements. When it is asked again is hq's (its
 * schedule), so a `next_check` the model still sends is ignored; and a `hum`, a tool it no longer has (the backchannel's),
 * is an unknown tool: `keep_listening`.
 *
 * A spoken line's `tone` (spec §Tone) is one of the six; absent, or anything else, is calm. The listening style is no
 * longer the light model's to set (the reply's `set_listening_style`): a `style` it still sends is ignored.
 */
import { VOICE_HUM_TONES, type VoiceHumTone } from '@agenthix/core'
import { LISTENER_SETTINGS, type ListenerSettings } from './settings'
import { ENDS_TURN, SAYS, isListenerTool } from './tools'

export interface ListenerResponse {
  /** The words the model wrote outside any tool call: none in the tools variant, the object in the JSON variant. */
  text: string
  calls: readonly { name: string; input: unknown }[]
}

export type DropReason =
  | 'no tool'
  | 'two tools'
  | 'text beside a tool'
  | 'unknown tool'
  | 'ends the turn outside a sounds finished call'
  | 'over the word cap'
  | 'no words'
  | 'not JSON'

/** The reason, when the call asked for one (`withReason`): on any decision, shown only in the playground. */
export type ListenerDecision = ListenerChoice & { why?: string }

type ListenerChoice =
  | { tool: 'keep_listening'; dropped?: { reason: DropReason; tool?: string } }
  | { tool: 'acknowledge' | 'invite' | 'close_turn'; say: string; /** Absent for calm. */ tone?: VoiceHumTone }
  | {
      tool: 'hand_over'; asked: string; answer: string | null; hold: string; /** Absent for calm. */ tone?: VoiceHumTone
      /** The answer ran over its cap and was cut to it. */ answerCut?: boolean
    }

export interface ParseContext {
  mode: 'tools' | 'json'
  /** Only a *sounds finished* call may end the turn. */
  soundsFinished: boolean
  settings?: ListenerSettings
}

export function countWords(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

function asObject(input: unknown): Record<string, unknown> | null {
  let value = input
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return null }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const hasWords = (s: string) => /[\p{L}\p{N}]/u.test(s)

/** The JSON variant's one object, alone or inside a code fence; null for anything else. */
function readJsonObject(raw: string): Record<string, unknown> | null {
  const fenced = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const body = (fenced ? fenced[1] : raw).trim()
  if (!body.startsWith('{')) return null
  try { return asObject(JSON.parse(body)) } catch { return null }
}

/** Most characters of a reason kept: a few words over the 25 asked for, never more. */
const REASON_MAX_CHARS = 240

/** The reason a call gave, read only when the settings ask for one; cut, never dropped. */
function readReason(response: ListenerResponse, ctx: ParseContext): string | null {
  const input = ctx.mode === 'tools' ? asObject(response.calls[0]?.input) : readJsonObject(response.text)
  const why = text(input?.why)
  return why ? why.slice(0, REASON_MAX_CHARS) : null
}

/** A line's tone, when it is one of the six and not calm: calm is no field at all. */
const toned = (v: unknown): { tone?: VoiceHumTone } =>
  v !== 'calm' && (VOICE_HUM_TONES as readonly unknown[]).includes(v) ? { tone: v as VoiceHumTone } : {}

export function parseListenerResponse(response: ListenerResponse, ctx: ParseContext): ListenerDecision {
  const decision: ListenerDecision = parseChoice(response, ctx)
  if (!(ctx.settings ?? LISTENER_SETTINGS).withReason) return decision
  const why = readReason(response, ctx)
  return why ? { ...decision, why } : decision
}

function parseChoice(response: ListenerResponse, ctx: ParseContext): ListenerChoice {
  const settings = ctx.settings ?? LISTENER_SETTINGS
  const keep = (reason: DropReason, tool?: string): ListenerChoice => ({
    tool: 'keep_listening', dropped: { reason, ...(tool ? { tool } : {}) },
  })

  let name: string
  let args: Record<string, unknown> | null
  if (ctx.mode === 'tools') {
    if (response.calls.length === 0) return keep('no tool')
    name = response.calls[0].name
    if (response.calls.length > 1) return keep('two tools', name)
    if (response.text.trim()) return keep('text beside a tool', name)
    args = asObject(response.calls[0].input)
  } else {
    if (response.calls.length > 0) return keep('two tools', response.calls[0].name)
    args = readJsonObject(response.text)
    if (!args) return keep('not JSON')
    // The measured instructions say `action` and `say`; the spec's example says `tool` and `words`: both are read.
    const action = typeof args.action === 'string' && args.action ? args.action : typeof args.tool === 'string' ? args.tool : ''
    if (!action) return keep('no tool')
    name = action
    if (args.say === undefined && args.words !== undefined) args = { ...args, say: args.words }
    if (name === 'hand_over' && args.hold === undefined && args.words !== undefined) args = { ...args, hold: args.words }
  }

  if (!isListenerTool(name)) return keep('unknown tool', name)
  if (ENDS_TURN.has(name) && !ctx.soundsFinished) return keep('ends the turn outside a sounds finished call', name)

  if (name === 'keep_listening') return { tool: 'keep_listening' }

  if (name === 'hand_over') {
    const hold = text(args?.hold)
    if (!hasWords(hold)) return keep('no words', name)
    if (countWords(hold) > settings.caps.hold) return keep('over the word cap', name)
    // Never heard, so over its cap it is cut, not dropped, and the hand over stands.
    const full = text(args?.answer)
    const cut = countWords(full) > settings.caps.answer
    const answer = cut ? full.split(/\s+/).slice(0, settings.caps.answer).join(' ') : full
    return { tool: 'hand_over', asked: text(args?.asked), answer: answer || null, hold, ...toned(args?.tone), ...(cut && { answerCut: true }) }
  }

  if (SAYS.has(name)) {
    const say = text(args?.say)
    if (!hasWords(say)) return keep('no words', name)
    const tool = name as 'acknowledge' | 'invite' | 'close_turn'
    if (countWords(say) > settings.caps[tool]) return keep('over the word cap', name)
    return { tool, say, ...toned(args?.tone) }
  }
  return keep('unknown tool', name)
}

/** The words a decision speaks, if any: a line the person hears. */
export function spokenWords(decision: ListenerDecision): string | null {
  if (decision.tool === 'keep_listening') return null
  return decision.tool === 'hand_over' ? decision.hold : decision.say
}
