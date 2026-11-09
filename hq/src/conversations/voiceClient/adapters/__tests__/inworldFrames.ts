/**
 * Frames recorded from Inworld's streaming speech to text (`inworld/inworld-stt-1`, 8 Nov 2026), from scripted
 * test phrases streamed at real-time pace. Text and order as they came; frames other than transcriptions and pauses
 * left out, and a 30 s turn's word list cut to its first and last word.
 */
const transcript = (text: string, isFinal: boolean, words: Array<[string, number, number]> = []) => JSON.stringify({
  result: {
    transcription: {
      transcript: text, isFinal, voiceProfile: null, silenceDurationMs: isFinal ? 96 : 0,
      wordTimestamps: words.map(([word, startTimeMs, endTimeMs]) => ({ word, confidence: 0, startTimeMs, endTimeMs })),
    },
  },
})
const pause = JSON.stringify({ result: { speechStopped: { silenceDurationMs: 96 } } })
const started = JSON.stringify({ result: { speechStarted: { startTimeMs: 0, confidence: 0 } } })

/** Short answers: six turns on one connection, none with a turn number. */
export const SHORT_ANSWERS: string[] = [
  started,
  transcript('Should I book it', false),
  transcript('Should I book the meeting?', false),
  pause,
  transcript('Should I book the meeting?', true),
  started,
  pause,
  transcript('Yes.', false),
  transcript('Yes.', true),
  transcript('Which day?', false),
  transcript('Which day suits you?', false),
  pause,
  transcript('Which day suits you?', true),
  transcript('Tuesday.', false),
  pause,
  transcript('Tuesday.', true),
  transcript('The morning is', false),
  transcript('The morning slot or the afternoon slot?', false),
  pause,
  transcript('The morning slot or the afternoon one?', true),
  transcript('The second one.', false),
  pause,
  transcript('The second one.', true),
]

export const SHORT_ANSWERS_TURNS = [
  'Should I book the meeting?', 'Yes.', 'Which day suits you?', 'Tuesday.', 'The morning slot or the afternoon one?', 'The second one.',
]

/** A final with its words timed in ms of audio sent on the socket; interim words hold only the settled ones. */
export const TIMED_FINAL = transcript('Send me the test results.', true, [
  ['Send', 726774, 727074], ['me', 727074, 727174], ['the', 727174, 727274], ['test', 727274, 727564], ['results', 727594, 728224],
])
export const TIMED_PARTIAL = transcript('The deploy finished at ten past nine.', false, [['The', 4778, 4878], ['deploy', 4878, 5288]])

/** A minute of talking with no pause: Inworld cut the turn itself at 30 s, mid-sentence, and went on in the next. */
export const CUT_AT_THIRTY_SECONDS: string[] = [
  transcript('If everything looks good, we can release it', false),
  transcript("If everything looks good, we can release it to the first customers on Wednesday. Between us, I'm not going to", true, [['If', 10494, 10684], ['to', 40494, 40494]]),
  started,
  transcript('Convince the Wednesday team.', false),
]

export const ERROR_TOKEN_USED = JSON.stringify({ error: { code: 16, message: 'invalid JWT token: token already used', details: [] } })
export const PAUSE = pause
export const partial = (text: string) => transcript(text, false)
export const final = (text: string) => transcript(text, true)
