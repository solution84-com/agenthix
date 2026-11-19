/**
 * What the Log's badges and tags mean: the key the Log's "Badges" button opens, and each badge's and tag's hover title.
 * The badge is who acted; the tag is what they did. Checked against what the steps carry (`lightSteps.ts`,
 * `otherSteps.ts`, `logTurns.ts`).
 */
import type { ListenerToolName } from '../../voice/listener/tools'
import type { LogActor, LogTag } from './logModel'

export const ACTOR_HELP: Record<LogActor, string> = {
  YOU: 'You: each stretch of your words between two other steps, or a message you typed.',
  SOUND: 'The sound model: it decides you have finished speaking, how sure it is and after how long a quiet.',
  LIGHT: 'The light model: each time it is asked, why, and the action it chose; then the line it wrote, as it plays.',
  HEAVY: 'The conversation model: the reply you heard, with its model, tokens and time, and the recap it writes after.',
  SYSTEM: "hq's own rules: the fallback's hand over, a stored hold phrase, closing a turn kept open too long, notices and errors.",
  BACKCHANNEL: 'The backchannel: a hum recorded ahead, played by rule in a pause while you talk, of the kind and tone the hum service last picked from your words. It belongs to no turn: it ends, keeps open and is told to nothing.',
  PACE: 'How the agent listens to you now: your pace, learned from the pauses you go on after, which sets how long a quiet counts as the end and how late a hum may come; and the listening style you asked for. Held for this conversation in the page only.',
  VOICE: 'The voice profile: how you sound, as the speech to text heard it beside your words: an emotion and a vocal style, each with its confidence.',
  TONE: "The voice hint: how you sound, from the voice profile, offered as a word to the light model and the listening read, which weigh it with your words. Each part picks its own tone: the hums, the light model's lines (on its rows) and the reply (on its row). With Tone off, none is offered and all is calm.",
}

/** LIGHT's five actions: what each means, what you hear, and what happens to the turn. */
export const LIGHT_ACTIONS: readonly { action: ListenerToolName; means: string; hear: string; turn: string }[] = [
  { action: 'keep_listening', means: "You aren't done; wait", hear: 'nothing', turn: 'stays open' },
  { action: 'acknowledge', means: 'You said something worth a word back', hear: 'a line: “Right.”', turn: 'stays open' },
  { action: 'invite', means: 'A long quiet; invite you to go on', hear: 'a line: “Take your time.”', turn: 'stays open' },
  { action: 'close_turn', means: 'Nothing for the heavy model to do (“thanks”, “stop”)', hear: 'a line: a closing line', turn: 'ends; no heavy model call' },
  { action: 'hand_over', means: 'A real request: the heavy model answers', hear: "a line: a hold, then HEAVY's reply", turn: 'ends; HEAVY answers' },
]

const ACTION_HELP = Object.fromEntries(LIGHT_ACTIONS.map(a => [a.action, `${a.means}. You hear ${a.hear}; the turn ${a.turn}.`])) as Record<ListenerToolName, string>

export const TAG_HELP: Record<LogActor, Partial<Record<LogTag, string>>> = {
  YOU: {
    said: 'What you said between two other steps, or typed.',
    'stopped the reply': 'What you said over the reply that stopped it: a stop word, or enough words of your own. It does not end a turn.',
  },
  SOUND: { finished: 'The sound model decided you had finished: how sure, how long you had been quiet, and how many "not finished" verdicts came before.' },
  LIGHT: {
    ...ACTION_HELP,
    'no answer': 'No answer counted: a newer check replaced it, it was still waiting at its time limit, or the call failed.',
    line: 'The words the light model wrote, as they played, and the decision they came from.',
  },
  HEAVY: { reply: 'The reply, as you heard it: its model and tokens, and when its first words came after the hand-over.', recap: 'The short summary of the conversation written after a reply you heard.' },
  SYSTEM: {
    hand_over: 'No check answered within its time limit (2 s) of SOUND saying you finished: hq handed over on its own.',
    line: 'One of hq\'s stored hold phrases, played when hq handed over on its own.',
    close: 'A turn kept open after a "not yet" reached its limit (60 s): hq handed it over with a stored hold, or, after an invitation nobody answered, closed it with a stored closing line when the light model gave none of its own.',
    notice: 'Something worth knowing that did not fail.',
    error: 'Something that failed.',
  },
  BACKCHANNEL: {
    hum: 'A hum in a pause the sound model said was not the end (or said finished while false finishes made it wait), or as the light model kept your turn open with nothing to say, after enough of your speech since the agent last made a sound (less for a reaction: sympathy, news, delight, a laugh, which also stays held over plainer answers for a while, is used at one breath only, and never comes twice in a row without a hum or more speech between): its kind and tone, the word picked from the hum library, whether it was made new or already made for the voice, the hum service\'s answer it came from (or what stood in, and why), how long you had paused, why it came and that speech. Or why none played.',
    service: 'An answer of the hum service, asked about once a second while you speak and once more as a pause begins (marked so): the kind and tone it picked, and how long its call took. Folded under the card\'s one line of them.',
    'no hum': 'A near miss: a pause in your turn with no hum, and the one rule that held it back. Folded under the card\'s count of near misses.',
  },
  PACE: {
    pace: 'The pace in force as the sound model ended your turn: how many breaths it has heard, the share of them under a length, and the finish wait and latest hum they set; before enough breaths, the fixed ones.',
    style: 'The listening style changed: no hums, fewer hums, patient (a longer wait, and no line until your turn has ended) or back to normal, as the reply set it when you asked.',
  },
  VOICE: { voice: 'A reading that changed: your top emotion and vocal style and how sure, whether it came on a final transcript, and how many readings came so far. Every reading is in the trace.' },
  TONE: { tone: 'The voice hint changed: how you sound now, or none (calm, neutral, anger and plain voices give none; so does Tone off).' },
}

/** Each actor and its tags, one line each, for the key. */
export const ACTOR_TAGS: readonly { actor: LogActor; tags: readonly LogTag[] }[] = [
  { actor: 'YOU', tags: ['said', 'stopped the reply'] },
  { actor: 'SOUND', tags: ['finished'] },
  { actor: 'LIGHT', tags: ['keep_listening', 'acknowledge', 'invite', 'close_turn', 'hand_over', 'no answer', 'line'] },
  { actor: 'HEAVY', tags: ['reply', 'recap'] },
  { actor: 'SYSTEM', tags: ['hand_over', 'line', 'close', 'notice', 'error'] },
  { actor: 'BACKCHANNEL', tags: ['hum', 'no hum', 'service'] },
  { actor: 'PACE', tags: ['pace', 'style'] },
  { actor: 'VOICE', tags: ['voice'] },
  { actor: 'TONE', tags: ['tone'] },
]

export const tagHelp = (actor: LogActor, tag: LogTag) => TAG_HELP[actor][tag] ?? ''
