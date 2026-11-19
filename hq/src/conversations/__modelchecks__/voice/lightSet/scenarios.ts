/**
 * The light model's scripted set (plan task 5.4): one scenario for each moment the spec names, each a short sequence
 * of listening calls — what the browser would ask, with the message so far and how long it has been quiet — and what
 * the spec says each call should come to. No audio: the calls go through hq's own listening call and the real model.
 * The light model is no longer asked while the person talks, and has no hum (the backchannel's, by rule): a pause
 * mid-sentence reaches it only when the sound model says they sound finished, and then it keeps listening.
 */
import type { LightScenario } from '../types'

const QUIET = ['keep_listening'] as const
const MORE_TO_COME = ['keep_listening', 'acknowledge'] as const
const NOT_YET = ['keep_listening', 'acknowledge', 'invite'] as const
const WHILE_WORKING = ['keep_listening', 'acknowledge'] as const

export const LIGHT_SCENARIOS: readonly LightScenario[] = Object.freeze([
  {
    id: 'mid-sentence', title: 'Sounds finished mid-sentence', wants: 'Keeps listening: they stopped before the sentence ends.',
    exchanges: [['agent', 'Sure, go ahead.']], recap: null,
    steps: [{ moment: 'soundsFinished', text: 'So I was looking at the numbers for the', quietMs: 600, expect: { choices: QUIET, turn: 'open' } }],
  },
  {
    id: 'sentence-ends', title: 'A sentence ends, more to come', wants: 'Keeps listening, or a short sign it is with them; never answers.',
    exchanges: [['agent', 'What did you want to go through?']], recap: null,
    steps: [{ moment: 'soundsFinished', text: "I've got two things to ask you about the launch.", quietMs: 600, expect: { choices: MORE_TO_COME, turn: 'open' } }],
  },
  {
    id: 'thinking-pause', title: 'A thinking pause', wants: 'Lets them think: nothing at first, an invitation only after a real silence.',
    exchanges: [['agent', 'What would you like to plan?']], recap: null,
    steps: [
      { moment: 'soundsFinished', text: 'I want to plan the launch, and, um', quietMs: 1500, expect: { choices: QUIET, turn: 'open' } },
      { moment: 'quiet', keptOpen: true, text: 'I want to plan the launch, and, um', quietMs: 5000, expect: { choices: QUIET, turn: 'open' } },
      { moment: 'quiet', keptOpen: true, text: 'I want to plan the launch, and, um', quietMs: 15_000, expect: { choices: [...QUIET, 'invite'], turn: 'open' } },
    ],
  },
  {
    id: 'finished-question', title: 'A finished question', wants: 'Hands over, with a hold that names what they asked; the answer is never spoken.',
    exchanges: [['agent', 'Anything else today?']], recap: null,
    steps: [{ moment: 'soundsFinished', text: "What's the weather going to be like in Melbourne tomorrow?", quietMs: 600, expect: { choices: ['hand_over'], turn: 'handedOver' } }],
  },
  {
    id: 'thanks', title: '"Thanks"', wants: 'Closes the turn alone: nothing needs knowing, deciding or doing.',
    exchanges: [['person', 'When is the review?'], ['agent', 'The review is on Thursday at ten.']],
    recap: 'The person asked when the review is; the agent said Thursday at ten.',
    steps: [{ moment: 'soundsFinished', text: 'Great, thanks.', quietMs: 600, expect: { choices: ['close_turn'], turn: 'closed' } }],
  },
  {
    id: 'stop-talking', title: '"Stop talking"', wants: 'Closes the turn alone: it is about the conversation itself.',
    exchanges: [['person', 'Tell me about the release.'], ['agent', 'The release has three parts. The first is the schema, then the screens, then the guide, and each of them']],
    recap: 'The agent is explaining the release at length.',
    steps: [{ moment: 'soundsFinished', text: 'Stop talking.', quietMs: 500, expect: { choices: ['close_turn'], turn: 'closed' } }],
  },
  {
    id: 'give-me-a-minute', title: '"Give me a minute"', wants: 'Not yet; still open part way through the minute; at the bound it goes to the heavy model.',
    exchanges: [['agent', 'Which invoice was it?']], recap: 'The person is asking about an invoice; the agent asked which one.',
    steps: [
      { moment: 'soundsFinished', text: 'Give me a minute, I need to find the invoice number.', quietMs: 700, expect: { choices: NOT_YET, turn: 'open' } },
      { moment: 'quiet', keptOpen: true, text: 'Give me a minute, I need to find the invoice number.', quietMs: 20_000, expect: { choices: NOT_YET, turn: 'open' } },
      { moment: 'quiet', keptOpen: true, text: 'Give me a minute, I need to find the invoice number.', quietMs: 61_000, expect: { choices: [], turn: 'fallback' } },
    ],
  },
  {
    id: 'long-wait', title: 'A long wait while the heavy model works', wants: 'Hands over, then at most a short further hold line while it waits; never a second hand over or an answer.',
    exchanges: [['agent', 'Sure, what do you need?']], recap: null,
    steps: [
      { moment: 'soundsFinished', text: 'Can you check whether the deploy from this morning went through?', quietMs: 600, expect: { choices: ['hand_over'], turn: 'handedOver' } },
      { moment: 'working', text: '', quietMs: 6000, workingMs: 6000, expect: { choices: WHILE_WORKING, turn: 'open' } },
      { moment: 'working', text: '', quietMs: 15_000, workingMs: 15_000, expect: { choices: WHILE_WORKING, turn: 'open' } },
      { moment: 'working', text: '', quietMs: 30_000, workingMs: 30_000, expect: { choices: WHILE_WORKING, turn: 'open' } },
    ],
  },
  // Listening style (adaptive voice listening, spec §The heavy model → *The listening style as an action*): the person
  // asks to be listened to differently; the light model hands it over, and the reply sets it with set_listening_style.
  ...([
    ['style-hums-off', 'Stop the mm-hms (listening style)', 'Could you stop humming while I talk? The mm-hms put me off.', 'hums_off'],
    ['style-hums-fewer', 'Fewer of those (listening style)', 'Fewer of those little sounds, please.', 'hums_fewer'],
    ['style-patient', 'Let me finish (listening style)', 'Stop interrupting me, let me finish.', 'patient'],
    ['style-normal', 'Back to normal (listening style)', "It's fine, you can hum again, back to normal.", 'normal'],
  ] as const).map(([id, title, text, style]): LightScenario => ({
    id, title, wants: `Hands the request over with a hold: the reply sets ${style}, the light model no longer does.`,
    exchanges: [['agent', 'Go on, I\'m listening.']], recap: null,
    steps: [{ moment: 'soundsFinished', text, quietMs: 700, expect: { choices: ['hand_over'], turn: 'handedOver' } }],
  })),
] satisfies LightScenario[])
