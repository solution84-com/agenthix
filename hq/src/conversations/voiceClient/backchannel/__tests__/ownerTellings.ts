/**
 * The owner's three tellings of 18 Nov, as the page's trace logged them (the voice playground's server log), as voice
 * events on the page's clock: a hiking story of about 38 s, a "just so you know" telling, and a packing list ending
 * "Did I forget anything?". hq's answers, logged by the server only, are placed on the page's clock from the nearest
 * page line. The words on screen are the words as sent, placed just after the pause they were sent from. The one hum
 * the log holds is left out: the replay makes its own. Agent sounds last about 0.32 s a word.
 */
import type { TurnAnswer, VoiceEventBody } from '../../events'

export type Timed = [number, VoiceEventBody]

const silence = (t: number, silent: boolean): Timed[] => [[t, { kind: 'acoustic.silence', silent }]]
const verdict = (t: number, answer: TurnAnswer, silenceMs: number, confidence: number): Timed[] =>
  [[t, { kind: 'semantics.decision', answer, confidence, silenceMs, by: 'model' }]]
const words = (t: number, text: string): Timed[] => [[t, { kind: 'stt.utterance', text }]]
const finished = (t: number, call: number, text: string): Timed[] => [
  [t, { kind: 'listen.ask', call, moment: 'soundsFinished', text, quietMs: 800 }],
  [t, { kind: 'orchestration.send', text, append: false, via: 'listen' }],
]
const send = (t: number, text: string, append: boolean): Timed[] => [[t, { kind: 'orchestration.send', text, append }]]
const answer = (t: number, call: number, handedOver: boolean): Timed[] => handedOver
  ? [[t, { kind: 'listen.answer', call, action: 'hand_over', nextCheckSecs: 4, turn: 'handedOver', lineId: `L${call}` }], [t, { kind: 'listen.turn', state: 'handedOver' }]]
  : [[t, { kind: 'listen.answer', call, action: 'keep_listening', nextCheckSecs: 5 }], [t, { kind: 'listen.turn', state: 'notYet' }]]
const sound = (t: number, text: string, ms: number): Timed[] =>
  [[t, { kind: 'phrase.at', text, playing: true, lineId: text }], [t + ms, { kind: 'phrase.at', text, playing: false, lineId: text }]]
const reply = (t: number, playing: boolean): Timed[] =>
  [[t, { kind: 'playback.at', replyId: 'r', index: 0, elapsedMs: 0, ended: !playing, playing }]]

/** Each telling, from its first words to the end of the reply to it. */
export const TELLINGS = {
  hiking: [0, 80_000],
  justSoYouKnow: [80_000, 120_000],
  packing: [120_000, 160_000],
} as const

export const OWNER_TELLINGS: Timed[] = [
  ...silence(3800, false),
  ...silence(4300, true),
  ...silence(4700, false),
  ...verdict(4800, 'UNCERTAIN', 500, 0.01),
  ...silence(5900, true),
  ...verdict(6400, 'UNCERTAIN', 500, 0.39),
  ...verdict(6900, 'UNCERTAIN', 1000, 0.39),
  ...silence(6900, false),
  ...silence(10_200, true),
  ...verdict(10_800, 'UNCERTAIN', 500, 0.15),
  ...verdict(11_300, 'KEEP_LISTENING', 1000, 0.15),
  ...silence(11_600, false),
  ...silence(14_100, true),
  ...silence(14_300, false),
  ...silence(15_500, true),
  ...words(15_600, "So last weekend, I finally went hiking up the falls. We left really early, about 6 in the morning,"),
  ...verdict(16_000, 'READY', 500, 0.87),
  ...finished(16_300, 1, "So last weekend, I finally went hiking up the falls. We left really early, about 6 in the morning,"),
  ...silence(16_800, false),
  ...answer(17_834, 1, false),
  ...silence(18_600, true),
  ...verdict(19_100, 'UNCERTAIN', 500, 0.76),
  ...verdict(19_600, 'UNCERTAIN', 1000, 0.76),
  ...silence(20_300, false),
  ...silence(20_900, true),
  ...words(21_000, "So last weekend, I finally went hiking up the falls. We left really early, about 6 in the morning, The first hour was easy."),
  ...verdict(21_400, 'UNCERTAIN', 500, 0.01),
  ...silence(21_500, false),
  ...finished(21_600, 2, "So last weekend, I finally went hiking up the falls. We left really early, about 6 in the morning, The first hour was easy."),
  ...silence(22_100, true),
  ...verdict(22_700, 'UNCERTAIN', 500, 0.09),
  ...answer(22_983, 2, false),
  ...verdict(23_200, 'KEEP_LISTENING', 1000, 0.09),
  ...silence(23_200, false),
  ...silence(24_500, true),
  ...silence(24_900, false),
  ...verdict(25_000, 'UNCERTAIN', 500, 0.03),
  ...silence(25_700, true),
  ...silence(25_900, false),
  ...silence(28_000, true),
  ...verdict(28_500, 'UNCERTAIN', 500, 0.72),
  ...verdict(29_000, 'UNCERTAIN', 1000, 0.72),
  ...silence(29_000, false),
  ...silence(29_500, true),
  ...verdict(30_100, 'UNCERTAIN', 500, 0.69),
  ...verdict(30_600, 'UNCERTAIN', 1000, 0.69),
  ...silence(30_800, false),
  ...silence(33_400, true),
  ...verdict(33_900, 'UNCERTAIN', 500, 0.01),
  ...verdict(34_400, 'KEEP_LISTENING', 1000, 0.01),
  ...silence(34_900, false),
  ...silence(37_400, true),
  ...words(37_500, "So last weekend, I finally went hiking up the falls. We left really early, about 6 in the morning, The first hour was easy. forest. Then it got steep and long and my friend twisted her ankle. Anyway,"),
  ...verdict(37_900, 'READY', 500, 0.97),
  ...finished(38_200, 3, "So last weekend, I finally went hiking up the falls. We left really early, about 6 in the morning, The first hour was easy. forest. Then it got steep and long and my friend twisted her ankle. Anyway,"),
  ...answer(39_754, 3, true),
  ...sound(41_100, "Okay, let me think about the best way on that ankle.", 3520),
  ...reply(44_000, true),
  ...reply(79_800, false),
  ...silence(80_900, false),
  ...silence(82_200, true),
  ...silence(82_600, false),
  ...verdict(82_700, 'UNCERTAIN', 500, 0.01),
  ...silence(85_600, true),
  ...verdict(86_100, 'UNCERTAIN', 500, 0.73),
  ...verdict(86_600, 'UNCERTAIN', 1000, 0.73),
  ...silence(86_900, false),
  ...silence(89_500, true),
  ...words(89_600, "Just so you know, I've moved the launch to next Friday. Marketing asked for more time."),
  ...verdict(90_000, 'READY', 500, 0.85),
  ...finished(90_400, 5, "Just so you know, I've moved the launch to next Friday. Marketing asked for more time."),
  ...answer(91_440, 5, true),
  ...silence(91_500, false),
  ...silence(92_700, true),
  ...sound(92_800, "Got it, let me take in the new launch date.", 3200),
  ...words(92_800, "And the design team is fine with it."),
  ...verdict(93_200, 'UNCERTAIN', 500, 0.83),
  ...verdict(93_700, 'READY', 1000, 0.83),
  ...send(94_100, "And the design team is fine with it.", true),
  ...reply(96_500, true),
  ...reply(107_100, false),
  ...silence(125_000, false),
  ...silence(126_800, true),
  ...silence(126_900, false),
  ...silence(127_200, true),
  ...silence(127_500, false),
  ...verdict(127_700, 'READY', 500, 0.95),
  ...silence(128_400, true),
  ...verdict(128_900, 'UNCERTAIN', 500, 0.01),
  ...verdict(129_400, 'KEEP_LISTENING', 1000, 0.01),
  ...silence(129_400, false),
  ...silence(130_400, true),
  ...words(130_500, "For the trip, I need to pack food. Foods. A rain jacket."),
  ...verdict(130_900, 'READY', 500, 0.92),
  ...finished(131_200, 6, "For the trip, I need to pack food. Foods. A rain jacket."),
  ...silence(131_800, false),
  ...answer(131_994, 6, true),
  ...silence(132_800, true),
  ...sound(133_000, "Let me look at the packing for your trip.", 2880),
  ...verdict(133_300, 'UNCERTAIN', 500, 0.63),
  ...verdict(133_800, 'UNCERTAIN', 1000, 0.63),
  ...silence(134_300, false),
  ...silence(135_400, true),
  ...words(135_500, "2 jumpers."),
  ...verdict(135_900, 'UNCERTAIN', 500, 0.53),
  ...send(135_900, "2 jumpers.", true),
  ...verdict(136_400, 'UNCERTAIN', 1000, 0.53),
  ...silence(136_400, false),
  ...silence(137_300, true),
  ...silence(137_500, false),
  ...silence(138_700, true),
  ...words(138_800, "And snacks. Did I forget anything?"),
  ...verdict(139_200, 'READY', 500, 0.98),
  ...send(139_600, "And snacks. Did I forget anything?", true),
  ...reply(143_400, true),
  ...reply(152_600, false),
].sort((a, b) => a[0] - b[0])
