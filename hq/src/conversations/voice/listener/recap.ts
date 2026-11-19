/**
 * The recap (adaptive voice listening, spec §The recap, corrected after phase 1): after each reply, one small call to
 * the heavy model — the conversation's own model, with none of the agent's instructions or tools — writes where the
 * conversation is now, for the light model to read. It reads the previous recap, the person's message and this turn's
 * agent message, and nothing else. Pure: the instructions, the message, and the reading of what comes back.
 */
import { LISTENER_SETTINGS, type ListenerSettings } from './settings'

/** Raised with every change to the text. */
export const RECAP_INSTRUCTIONS_VERSION = 1

export interface RecapInput {
  agent: string
  person: string
  previousRecap: string | null
  /** The person's message this turn. */
  message: string
  /** This turn's agent message: what the person heard while they spoke, then the reply. */
  agentMessage: string
}

const MAX_INPUT_CHARS = 4000

function keepStart(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${space > 0 ? cut.slice(0, space) : cut}…`
}

function instructions(maxWords: number): string {
  return `You keep a short recap of a live voice conversation between a person and an assistant. A listener reads it to follow the conversation; it is never spoken or shown.

Write the new recap from the previous one and the latest exchange: where the conversation is now, what the person wants, and anything left open (a question not yet answered, work under way, something promised). Keep what still matters from the previous recap and drop what is settled. Plain sentences, no lists, no heading, under ${maxWords} words. Name the person and the assistant as given. Write only the recap.`
}

export function buildRecapCall(input: RecapInput, settings: ListenerSettings = LISTENER_SETTINGS): { system: string; user: string } {
  const previous = input.previousRecap?.trim() ? keepStart(input.previousRecap.trim(), MAX_INPUT_CHARS) : '(none yet)'
  const user = [
    `The person is ${input.person}; the assistant is ${input.agent}.`,
    `Previous recap:\n<recap>\n${previous}\n</recap>`,
    `${input.person} said:\n<message>\n${keepStart(input.message.trim(), MAX_INPUT_CHARS)}\n</message>`,
    `${input.agent} said:\n<reply>\n${keepStart(input.agentMessage.trim(), MAX_INPUT_CHARS)}\n</reply>`,
    'Write the new recap.',
  ].join('\n\n')
  return { system: instructions(settings.recapMaxWords), user }
}

/** What the call wrote, as the recap to store: trimmed, null when empty, and within the cap, cut at a sentence or a word. */
export function readRecap(text: string, settings: ListenerSettings = LISTENER_SETTINGS): string | null {
  let t = text.trim().replace(/^recap\s*:\s*/i, '').trim()
  const quoted = t.match(/^["“](.*)["”]$/s)
  if (quoted) t = quoted[1].trim()
  if (!t) return null
  const max = settings.recapMaxWords
  const words = t.split(/\s+/)
  if (words.length <= max) return t
  const within = words.slice(0, max).join(' ')
  if (/[.!?]$/.test(within)) return within
  const sentenceEnd = Math.max(within.lastIndexOf('. '), within.lastIndexOf('! '), within.lastIndexOf('? '))
  if (sentenceEnd > 0) return within.slice(0, sentenceEnd + 1)
  return `${within}…`
}
