/**
 * The listening read's call (adaptive voice listening, spec §The listening read): which small sound of listening a good
 * listener would make if the person paused right now: its kind (what it means) and its tone (how it is said). The
 * words are never its: the page picks them from the kind's list in the hum library. It reads only their current turn's
 * last words and the last three sounds played: no conversation, no names, no recap; with Tone on, how they sound from
 * their voice (the voice hint).
 */
import { HUM_KINDS, HUM_TONES, type HumKind, type HumTone } from '../../voiceClient/backchannel/kinds'
import { HUM_LIBRARY } from '../../voiceClient/backchannel/library'

/** Raised with every change to the text, so a measurement names the version it ran. */
export const HUM_INSTRUCTIONS_VERSION = 8

/** How long a call may take: an answer later than this is stale on the page anyway. */
export const HUM_CALL_LIMIT_MS = 2_000

/** The most of the turn it reads: the end, where the moment is. */
export const HUM_WORDS = 60

/** Added after their words on the call made as a pause begins. */
export const HUM_PAUSED_LINE = 'They have just paused.'

/** Added after their words when the agent made sounds in this conversation. */
export const HUM_RECENT_LINE = 'Your recent sounds:'

/** Added after their words, with Tone on, when their voice says how they sound: hq's words, never the page's. */
export const HUM_HINT_LINE = 'From their voice, they are:'

/** The sounds it is told of: its last three. */
export const HUM_RECENT = 3

/** When each kind fits, in a few words. */
export const HUM_KIND_FITS: Readonly<Record<HumKind, string>> = {
  continuer: "a neutral telling: go on, I'm following",
  receipt: 'they told it something: taken in',
  news: 'something new or changed',
  realisation: 'it now understands what they meant',
  thoughtful: 'an idea, a plan, a dilemma',
  agreement: 'a fact they state, never their opinion or plan',
  sympathy: 'something bad happened to them',
  delight: 'good news',
  amusement: 'they said something funny',
}

/** When each tone is chosen. */
export const HUM_TONE_WHEN: Readonly<Record<HumTone, string>> = {
  calm: 'telling something ordinary and neutral: facts, a plan, a sequence of events (the default)',
  warm: 'sharing something personal, hesitant or effortful, where encouragement helps them go on',
  curious: 'building up to something: a story with its point still to come, news unfolding',
  thoughtful: 'weighing an idea, a dilemma or a choice',
  gentle: 'telling something bad, worrying or frustrating',
  bright: 'telling good news, excitement or something funny',
}

export const HUM_INSTRUCTIONS = [
  'You listen to someone talking and pick the small sound a good listener would make if they paused right now: its kind and its tone.',
  '',
  'Kinds (what the sound means), each with the tones it takes:',
  ...HUM_KINDS.map(k => `- ${k} (${HUM_LIBRARY[k].tones.join(', ')}): ${HUM_KIND_FITS[k]}`),
  '',
  'Tones (how you feel about this moment); choose by what they are telling:',
  ...HUM_TONES.map(t => `- ${t}: ${HUM_TONE_WHEN[t]}`),
  '',
  'Their words are a live speech-to-text transcript: its punctuation is unreliable, the latest words often have none, and a comma or nothing may stand where they finished a sentence.',
  'Answer none only when the ending is plainly cut off (the last word is one like "the", "a", "and", "but", "because", "to", "my", or "then it got"), or when they just asked you a question.',
  'Otherwise answer a kind. A run of words that sounds finished ("we left really early about 6 in the morning", "I\'ve packed the tent,") is a continuer, or a receipt when they told you something to take in. Something new or changed ("I moved the launch to next Friday") is news.',
  `A line "${HUM_PAUSED_LINE}" after their words means they have stopped talking for now.`,
  'Answer on one line: the kind, then the tone, for example "sympathy gentle", "continuer calm" or "delight bright"; or the one word none. Nothing else: the words are chosen for you.',
  `A line "${HUM_HINT_LINE} …" says how they sound ("sounds sad", "laughing"): weigh it with their words, never above them.`,
  `A line "${HUM_RECENT_LINE}" lists the sounds played last: weigh them, so a moment already answered is not answered again in the same way.`,
  'Most of the time: continuer calm.',
].join('\n')

/** The turn's last `HUM_WORDS` words, spaced plainly. */
export function lastWords(text: string, most = HUM_WORDS): string {
  return text.trim().split(/\s+/).filter(Boolean).slice(-most).join(' ')
}

/** What the read is sent: the turn's last words, the pause line when it is the pause's call, and its last three sounds. */
export function readMessage(text: string, options: { atPause?: boolean; recent?: readonly string[]; hint?: string | null } = {}): string {
  const recent = (options.recent ?? []).slice(-HUM_RECENT)
  const after = [
    ...(options.atPause ? [HUM_PAUSED_LINE] : []), ...(options.hint ? [`${HUM_HINT_LINE} ${options.hint}.`] : []),
    ...(recent.length ? [`${HUM_RECENT_LINE} ${recent.join(' ')}`] : []),
  ]
  return after.length ? `${lastWords(text)}\n\n${after.join('\n')}` : lastWords(text)
}
