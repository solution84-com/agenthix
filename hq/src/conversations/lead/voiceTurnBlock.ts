/**
 * The voice turn block (voice that stays in the conversation, spec §1 and §2; plan task 4.3), while the `voiceBridge`
 * flag is on: the voice rules leave the base instructions and go with the turn's own message, after the cached prefix.
 * On a spoken message the whole block (version 36, as accepted): how to speak, how to judge whether the person has
 * finished, and when to open with one sentence saying the agent will look into it. On any other turn the person hears
 * (a typed message from whoever holds voice, a report or continuation while voice is on) only how to speak.
 *
 * Each person's Adaptive voice off leaves out the opening sentence; the hold stays (it is how a turn ends, not
 * something the agent adds).
 *
 * Under adaptive voice listening (the flag `voiceListener`) the light model judges whether the person has finished and
 * says the hold, so every turn is told only how to speak: no judging, no opening sentence, no trailed-off note — and
 * the same with the person's Adaptive voice off, which is plain voice. It is told it may change how it listens
 * (`set_listening_style`, offered with the flag), and, with Tone on (spec §Tone), to open a spoken reply with a
 * `[tone: …]` tag, which hq takes out before anything is spoken, shown or stored (`toneTag.ts`).
 */

const SPEAKING = `You are in a voice conversation with the user: they speak to you and hear your replies, so write for the ear.

How to speak:
- Talk the way people talk. Short sentences, plain words. No markdown: no headings, bullets, tables, bold or
  code. Anything that has to be seen goes in a shown part.
- Keep it a back and forth. One point at a time, then hand back to them; ask before adding a second point.
- Say numbers, dates, times and names in words. Give a result as one sentence, then offer the detail.
- Their words reach you through speech to text, which can miss a word. If something sounds wrong, ask.
- A spoken yes to an approval counts only after you read the action back in one sentence ("Approving: deploy
  to staging. Yes?") and they say yes to that. Then call answer_approval.`

const JUDGING = `Their message was spoken. First judge whether they have finished their thought. Judge it as a listener
would: would they expect an answer now, or are they still working out what to say? Signs they have not: the
message trails off or stops mid-sentence, or ends on a word that leads into more ("and", "so", "because")
or a pause filler ("um", "hmm"). These are examples, not a checklist; use the whole conversation and your own
judgement. A short message is finished if it answers you ("Yes.", "Tuesday.").

- Not finished: call the keep_listening tool with a short reason, and write nothing else. They will carry on,
  and their next words join the same message.`

const FINISHED = `- Finished: reply in plain spoken text.`

const OPENING = ` If your reply needs real work (background work, several steps, or a
  long answer), begin it with one short sentence saying you will look into what they asked, naming it in a few
  words, and in the same step make the tool call that does the work. Do not answer, state a result, or say it
  is done in that sentence. If you can answer straight away, just answer.`

/** The listening style is the agent's to change, by its tool (spec §The heavy model → *The listening style as an action*). */
const LISTENING_STYLE = `If they ask you to change how you listen while they talk, call set_listening_style and say in a few words
that you will: "stop humming", "no more mm-hms" is hums_off; "fewer of those" is hums_fewer; "let me finish",
"stop cutting in" is patient; "you can hum again", "back to normal" is normal. Only when they ask.`

/** The reply's tone (spec §Tone): one of the six, as a tag hq takes out. */
const TONE_TAG = `Start your reply with a tone tag for how your voice should sound, one of: [tone: calm] for ordinary
things, the default; [tone: warm] when they shared something personal or effortful; [tone: curious] when
something is unfolding; [tone: thoughtful] when weighing an idea or a choice; [tone: gentle] for something bad or
worrying; [tone: bright] for good news or something funny. The tag is never spoken or shown; write it once, first.`

/** Their words ended on a long pause while they seemed mid-thought (the audio turn model's reading). */
const TRAILED_OFF = 'Their words ended on a long pause while they seemed mid-thought, so they may not have finished.'

/** They paused mid-thought before, and went on: what they said since joined the same message. */
const WENT_ON = 'They paused mid-thought earlier and went on: their message is all of it, joined. Judge it as a whole.'

export interface VoiceTurn {
  /** What this turn answers was said aloud, through speech to text. */
  spoken: boolean
  /** The person's Adaptive voice: off, the agent never opens with a sentence of its own. */
  adaptiveVoice: boolean
  trailedOff: boolean
  /** They went on after a pause mid-thought: after a hold, or after an encouragement response. */
  wentOn: boolean
  /** Adaptive voice listening is on: the light model has judged the turn, so only how to speak is said. */
  listener?: boolean
  /** With `listener`, Tone is on: the reply opens with its tone tag. */
  toneTag?: boolean
}

export function voiceTurnBlock(turn: VoiceTurn): string {
  if (turn.listener) return [SPEAKING, LISTENING_STYLE, ...(turn.toneTag ? [TONE_TAG] : [])].join('\n\n')
  if (!turn.spoken) return SPEAKING
  const block = `${SPEAKING}\n\n${JUDGING}\n${turn.adaptiveVoice ? `${FINISHED}${OPENING}` : FINISHED}`
  const lines = [...(turn.wentOn ? [WENT_ON] : []), ...(turn.trailedOff ? [TRAILED_OFF] : [])]
  return lines.length ? `${block}\n\n${lines.join('\n')}` : block
}
