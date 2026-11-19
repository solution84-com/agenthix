/**
 * The Log as turns, pure: steps grouped into one card per turn with your words as stretches between the other steps,
 * every step timed from when you started speaking, each card's header, the steps that belong to no turn, and the three
 * rules (adaptive voice listening, the Log's proposal sections 4 and 5).
 */
import { describe, expect, it } from 'vitest'
import { checkRules } from '../logRules'
import type { LogStep } from '../logModel'
import { logTurns, newWords } from '../logTurns'

const T0 = 1_700_000_000_000
const at = (s: number) => T0 + Math.round(s * 1000)
let n = 0
const step = (s: number, p: Omit<LogStep, 'id' | 'at' | 'title'> & { title?: string; id?: string }): LogStep =>
  ({ id: p.id ?? `${p.actor}-${n++}`, at: at(s), title: p.title ?? p.tag, ...p })
const words = (...w: [number, string][]) => w.map(([s, text]) => ({ at: at(s), text }))
const check = (s: number, tag: LogStep['tag'], moment: string, p: Partial<LogStep> = {}) =>
  step(s, { actor: 'LIGHT', tag, check: true, attrs: { moment }, ...p })
const sound = (s: number, quietS = 0.5) => step(s, { actor: 'SOUND', tag: 'finished', stoppedAt: at(s - quietS) })

const rows = (c: { steps: { actor: string; tag: string; rel: number; title: string }[] }) =>
  c.steps.map(s => [(s.rel / 1000).toFixed(1), s.actor, s.tag, s.actor === 'YOU' ? s.title : ''])

describe('a hand-over turn', () => {
  const handOver = check(3.4, 'hand_over', 'soundsFinished', { id: 'h', ends: 'handedOver' })
  const view = logTurns({
    speechStarts: [at(0)],
    words: words([0.5, 'Can you look'], [0.9, 'Can you look up'], [1.7, 'Can you look up the weather'], [2.4, 'Can you look up the weather in Melbourne?'], [3.0, '']),
    messages: [{ at: at(3.5), text: 'Can you look up the weather in Melbourne?' }],
    steps: [
      check(1.2, 'no answer', 'quietAfterWords'),
      sound(2.9),
      handOver,
      step(4.6, { actor: 'LIGHT', tag: 'line', heard: true, from: 'h', fromWords: 'the hand_over', detail: 'played to its end' }),
      check(7.0, 'keep_listening', 'working'),
      step(9.0, { actor: 'HEAVY', tag: 'reply', answers: true, heard: true, sinceEnd: true }),
      step(15.4, { actor: 'HEAVY', tag: 'recap' }),
    ],
  })

  it('is one card, its steps in time order from when you started speaking, your words cut where something else happened', () => {
    expect(view.cards).toHaveLength(1)
    expect(rows(view.cards[0]!)).toEqual([
      ['0.0', 'YOU', 'said', '“Can you look up”'],
      ['1.2', 'LIGHT', 'no answer', ''],
      ['1.7', 'YOU', 'said', '“the weather in Melbourne?”'],
      ['2.9', 'SOUND', 'finished', ''],
      ['3.4', 'LIGHT', 'hand_over', ''],
      ['4.6', 'LIGHT', 'line', ''],
      ['7.0', 'LIGHT', 'keep_listening', ''],
      ['9.0', 'HEAVY', 'reply', ''],
      ['15.4', 'HEAVY', 'recap', ''],
    ])
    expect(view.loose).toEqual([])
  })

  it('says which decision a line came from, by its time, and when the reply came after the hand-over', () => {
    const steps = view.cards[0]!.steps
    expect(steps.find(s => s.tag === 'line')!.detail).toBe('from the hand_over at 3.4 s · played to its end')
    expect(steps.find(s => s.tag === 'reply')!.detail).toBe('first words 5.6 s after the hand-over')
  })

  it('heads the card with your message, the outcome and its timings, and breaks no rule', () => {
    const card = view.cards[0]!
    expect(card.message).toBe('Can you look up the weather in Melbourne?')
    expect(card.outcome).toBe('Handed to the heavy model')
    expect(card.timings).toEqual(['you stopped at 2.4 s', 'first sound 2.2 s after you stopped', 'answer 6.6 s after you stopped'])
    expect(card.steps.filter(s => s.ruleBroken)).toEqual([])
  })
})

describe('a card whose calls ran with the reason on', () => {
  it('is marked, and only that card', () => {
    const view = logTurns({
      speechStarts: [at(0), at(8)], messages: [],
      words: words([0.3, 'Great, thanks.'], [1.2, ''], [8.4, 'Bye.']),
      steps: [
        check(1.6, 'close_turn', 'soundsFinished', { ends: 'closed', reasonOn: true, why: 'A thank you.' }),
        check(9.6, 'close_turn', 'soundsFinished', { ends: 'closed' }),
      ],
    })
    expect(view.cards.map(c => c.reasonOn)).toEqual([false, true])
  })
})

describe('a near miss mid-turn @SC-2227', () => {
  it('sits in the card at its pause without cutting your words in two', () => {
    const view = logTurns({
      speechStarts: [at(0)], messages: [],
      words: words([0.4, 'So I was thinking'], [2.3, 'So I was thinking we could move it']),
      steps: [step(1.4, { actor: 'BACKCHANNEL', tag: 'no hum', nearMiss: true, title: 'the pause ended at 0.3 s' })],
    })
    expect(rows(view.cards[0]!)).toEqual([
      ['0.0', 'YOU', 'said', '“So I was thinking we could move it”'],
      ['1.4', 'BACKCHANNEL', 'no hum', ''],
    ])
  })
})

describe('a backchannel hum mid-turn @SC-2227', () => {
  it('sits in the turn\'s card between the two stretches of words it was heard between, and breaks no rule', () => {
    const view = logTurns({
      speechStarts: [at(0)], messages: [],
      words: words([0.4, 'So I was thinking'], [2.3, 'So I was thinking we could move it'], [4.0, 'So I was thinking we could move it to Thursday.']),
      steps: [
        step(1.4, { actor: 'BACKCHANNEL', tag: 'hum', title: '“Mm-hm.”' }),
        sound(6.8),
        check(7.3, 'hand_over', 'soundsFinished', { ends: 'handedOver' }),
      ],
    })
    expect(rows(view.cards[0]!)).toEqual([
      ['0.0', 'YOU', 'said', '“So I was thinking”'],
      ['1.4', 'BACKCHANNEL', 'hum', ''],
      ['2.3', 'YOU', 'said', '“we could move it to Thursday.”'],
      ['6.8', 'SOUND', 'finished', ''],
      ['7.3', 'LIGHT', 'hand_over', ''],
    ])
    expect(view.cards[0]!.steps.map(s => s.ruleBroken)).toEqual([undefined, undefined, undefined, undefined, undefined])
    expect(view.cards[0]!.message).toBe('So I was thinking we could move it to Thursday.')
  })
})

describe('a closed turn', () => {
  it('ends with the light model\'s close, and your next words start a new card, newest first', () => {
    const view = logTurns({
      speechStarts: [at(0), at(5)], messages: [],
      words: words([0.3, 'Great, thanks.'], [1.2, ''], [5.4, 'Bye.']),
      steps: [
        sound(1.1),
        check(1.6, 'close_turn', 'soundsFinished', { ends: 'closed' }),
        step(2.6, { actor: 'LIGHT', tag: 'line', heard: true }),
      ],
    })
    expect(view.cards.map(c => c.message)).toEqual(['Bye.', 'Great, thanks.'])
    const closed = view.cards[1]!
    expect(closed.outcome).toBe('Closed by the light model')
    expect(closed.timings).toEqual(['you stopped at 0.6 s', 'first sound 2.0 s after you stopped', 'no heavy model call'])
    expect(view.cards[0]!.zero).toBe(at(5))
  })
})

describe('a fallback turn', () => {
  it('shows SYSTEM handing over and its stored line, from that hand over', () => {
    const view = logTurns({
      speechStarts: [at(0)], messages: [], words: words([0.5, 'Can you explain how compound interest works?']),
      steps: [
        sound(2.6),
        check(3.1, 'no answer', 'soundsFinished'),
        step(5.4, { actor: 'SYSTEM', tag: 'hand_over', ends: 'fallback' }),
        step(5.45, { actor: 'SYSTEM', tag: 'line', heard: true, from: 'system', detail: 'a stored phrase · played to its end' }),
        step(9.8, { actor: 'HEAVY', tag: 'reply', answers: true, heard: true, sinceEnd: true }),
      ],
    })
    const card = view.cards[0]!
    expect(card.outcome).toBe('Fallback: the system handed over')
    expect(card.steps.find(s => s.tag === 'line')!.detail).toBe('from the hand_over at 5.4 s · a stored phrase · played to its end')
    expect(card.steps.filter(s => s.ruleBroken)).toEqual([])
  })
})

describe('a "not yet" turn closed at the limit', () => {
  it('stays open after the not yet, and SYSTEM closing it at the limit breaks no rule', () => {
    const view = logTurns({
      speechStarts: [at(0)], messages: [], words: words([0.4, 'Hmm, let me think']),
      steps: [
        sound(1.0),
        check(1.5, 'keep_listening', 'soundsFinished', { notYet: true }),
        check(8.0, 'keep_listening', 'quiet', { afterNotYet: true }),
        step(61.5, { actor: 'SYSTEM', tag: 'close', ends: 'bound', afterNotYet: true }),
        step(61.6, { actor: 'SYSTEM', tag: 'line', heard: true, from: 'system' }),
        step(64, { actor: 'HEAVY', tag: 'reply', answers: true, heard: true, sinceEnd: true }),
      ],
    })
    const card = view.cards[0]!
    expect(card.outcome).toBe('Kept open to the limit: the system handed over')
    expect(card.steps.find(s => s.tag === 'line')!.detail).toBe('from the close at 61.5 s')
    expect(card.steps.filter(s => s.ruleBroken)).toEqual([])
    const open = logTurns({ speechStarts: [], messages: [], words: words([0.4, 'Hmm']), steps: [sound(1), check(1.5, 'keep_listening', 'soundsFinished', { notYet: true })] })
    expect(open.cards[0]!.outcome).toBe('Not yet: kept open')
  })
})

describe('a "not yet" turn closed at the limit after an invitation nobody answered', () => {
  it('reads "Closed at the 60 s limit", with no heavy model call, and breaks no rule', () => {
    for (const end of [
      step(61.5, { actor: 'LIGHT', tag: 'close_turn', check: true, ends: 'limit', afterNotYet: true, attrs: { moment: 'limit' } }),
      step(61.5, { actor: 'SYSTEM', tag: 'close', ends: 'limit', afterNotYet: true }),
    ]) {
      const view = logTurns({
        speechStarts: [at(0), at(70)], messages: [], words: words([0.4, 'I was thinking we could maybe move the meeting to'], [70.2, 'Thursday']),
        steps: [
          sound(1.0),
          check(1.5, 'invite', 'soundsFinished', { notYet: true }),
          check(20, 'keep_listening', 'quiet', { afterNotYet: true }),
          end,
          step(61.6, { actor: end.actor, tag: 'line', heard: true }),
        ],
      })
      // The newest card first.
      const card = view.cards.at(-1)!
      expect(card.outcome).toBe('Closed at the 60 s limit')
      expect(card.timings).toContain('no heavy model call')
      expect(card.steps.filter(s => s.ruleBroken)).toEqual([])
      // What they say next is a new turn.
      expect(view.cards).toHaveLength(2)
    }
  })
})

describe('an early hand-over while you went on', () => {
  it('keeps the words you went on with in the same turn, and says so in the header', () => {
    const view = logTurns({
      speechStarts: [at(0), at(4.5)],
      words: words([0.5, "So I've been running for about three months."], [3.2, ''], [4.6, 'I started at two kilometres'], [6.0, "I started at two kilometres and now I'm doing eight."]),
      messages: [{ at: at(4.4), text: "So I've been running for about three months. I started at two kilometres and now I'm doing eight." }],
      steps: [
        sound(3.1, 0.9),
        check(4.3, 'hand_over', 'soundsFinished', { id: 'early', ends: 'handedOver' }),
        step(4.45, { actor: 'HEAVY', tag: 'reply', withdrawn: true }),
        step(5.0, { actor: 'LIGHT', tag: 'line', heard: true, from: 'early', fromWords: 'the hand_over' }),
        step(9.0, { actor: 'HEAVY', tag: 'reply', answers: true, heard: true }),
      ],
    })
    expect(view.cards).toHaveLength(1)
    const card = view.cards[0]!
    expect(rows(card).map(r => r.slice(1, 3))).toEqual([
      ['YOU', 'said'], ['SOUND', 'finished'], ['LIGHT', 'hand_over'], ['HEAVY', 'reply'], ['YOU', 'said'], ['LIGHT', 'line'], ['YOU', 'said'], ['HEAVY', 'reply'],
    ])
    expect(card.outcome).toBe('Handed to the heavy model · you went on after it · the reply was replaced')
    expect(card.message).toMatch(/doing eight\.$/)
  })
})

describe('steps with no turn', () => {
  it('go in a group of their own, before you first spoke', () => {
    const view = logTurns({
      speechStarts: [], messages: [], words: words([5, 'Hello']),
      steps: [step(1, { actor: 'SYSTEM', tag: 'notice', title: 'Voice started.' }), step(2, { actor: 'SYSTEM', tag: 'error', error: true })],
    })
    expect(view.loose.map(s => [s.tag, s.rel])).toEqual([['notice', 0], ['error', 1000]])
    expect(view.cards).toHaveLength(1)
    expect(view.cards[0]!.steps.map(s => s.actor)).toEqual(['YOU'])
  })

  it('a typed message always starts a turn of its own', () => {
    const view = logTurns({
      speechStarts: [], messages: [], words: [],
      steps: [step(1, { actor: 'YOU', tag: 'said', typed: true, title: '“Hi”' }), step(2, { actor: 'YOU', tag: 'said', typed: true, title: '“Again”' })],
    })
    expect(view.cards.map(c => c.message)).toEqual(['Again', 'Hi'])
  })
})

describe('the three rules', () => {
  const you = step(0, { actor: 'YOU', tag: 'said' })
  it('1: YOU comes first in a turn', () => {
    expect(checkRules([check(0, 'acknowledge', 'quiet'), you]).map(s => s.ruleBroken)).toEqual([1, undefined])
  })

  it('2: a LIGHT check follows some of your words', () => {
    expect(checkRules([you, check(1, 'keep_listening', 'quietAfterWords'), check(2, 'acknowledge', 'quietAfterWords')]).map(s => s.ruleBroken))
      .toEqual([undefined, undefined, 2])
    // After SOUND finished, a check needs no new words of its own.
    expect(checkRules([you, check(1, 'keep_listening', 'quietAfterWords'), sound(2), check(3, 'hand_over', 'soundsFinished', { ends: 'handedOver' })]).map(s => s.ruleBroken))
      .toEqual([undefined, undefined, undefined, undefined])
    expect(checkRules([you, check(1, 'keep_listening', 'quietAfterWords'), check(3, 'keep_listening', 'soundsFinished')]).map(s => s.ruleBroken))
      .toEqual([undefined, undefined, 2])
  })

  it('3: a turn ends only after SOUND finished, or a long quiet after a "not yet"', () => {
    expect(checkRules([you, check(1, 'hand_over', 'quietAfterWords', { ends: 'handedOver' })]).map(s => s.ruleBroken)).toEqual([undefined, 3])
    expect(checkRules([you, step(2, { actor: 'SYSTEM', tag: 'hand_over', ends: 'fallback' })]).map(s => s.ruleBroken)).toEqual([undefined, 3])
    expect(checkRules([you, check(3, 'hand_over', 'quiet', { ends: 'handedOver', afterNotYet: true })]).map(s => s.ruleBroken)).toEqual([undefined, undefined])
  })

  it('are marked on the card\'s steps', () => {
    const view = logTurns({ speechStarts: [], messages: [], words: words([0.2, 'Wait']), steps: [check(1, 'close_turn', 'quietAfterWords', { ends: 'closed' })] })
    expect(view.cards[0]!.steps.map(s => s.ruleBroken)).toEqual([undefined, 3])
  })
})

describe('your words between steps', () => {
  it('are the words after the ones already shown, whole when they were said again from the start', () => {
    expect(newWords('Can you look', 'Can you look up the')).toBe('up the')
    expect(newWords('', 'Hello')).toBe('Hello')
    expect(newWords('Hello there', 'Goodbye')).toBe('Goodbye')
  })
})
