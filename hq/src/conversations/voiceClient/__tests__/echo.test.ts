import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEchoGuard, sameWord, TAIL_MS, type HeardWord } from '../stt/echo'
import { createStreamClock } from '../streamClock'

const SAID = 'Right now your plate is Walkthrough, the morning check, and two tasks due today.'

/** The agent heard from `from` to `to`, ticked as the session ticks. */
function playing(guard: ReturnType<typeof createEchoGuard>, from: number, to: number) {
  for (let t = from; t <= to; t += 50) guard.audible(t)
}

const timed = (text: string, at: number, step = 300): HeardWord[] => text.split(' ').map((w, i) => ({ text: w, at: at + i * step }))

describe('telling the agent’s own voice from the person @SC-997', () => {
  it('compares words loosely: case, punctuation, a letter in a longer word', () => {
    expect(sameWord('walkthrough', 'walkthroughs')).toBe(true)
    expect(sameWord('morning', 'mourning')).toBe(true)
    expect(sameWord('is', 'it')).toBe(false)
    expect(sameWord('water', 'walkthrough')).toBe(false)
  })

  it('drops the agent’s words heard while it speaks', () => {
    const guard = createEchoGuard()
    guard.said(SAID, 0)
    playing(guard, 0, 5000)
    expect(guard.sift('your plate is walkthrough', timed('your plate is walkthrough', 1000), 6000)).toMatchObject({ text: '', words: 0 })
  })

  it('drops a few misheard words over the reply as noise, not a turn ("Plate is water.", "It.")', () => {
    const guard = createEchoGuard()
    guard.said(SAID, 0)
    playing(guard, 0, 5000)
    expect(guard.sift('Plate is water.', timed('Plate is water.', 1200), 7000).text).toBe('')
    expect(guard.sift('Up.', [{ text: 'Up.', at: 3000 }], 7000).text).toBe('')
  })

  it('keeps the person’s words over the reply once there are a couple, from where they start', () => {
    const guard = createEchoGuard()
    guard.said(SAID, 0)
    playing(guard, 0, 5000)
    const words = [...timed('your plate is', 1000), ...timed('no wait stop', 2000)]
    expect(guard.sift('your plate is no wait stop', words, 4000)).toMatchObject({ text: 'no wait stop', words: 3 })
  })

  it('drops the agent’s words heard just after it stopped, but keeps one word of the person’s there', () => {
    const guard = createEchoGuard()
    guard.said('Shall I start the morning check?', 0)
    playing(guard, 0, 2000)
    expect(guard.sift('morning check', timed('morning check', 2600), 5000).text).toBe('')
    expect(guard.sift('Yes.', [{ text: 'Yes.', at: 2600 }], 5000)).toMatchObject({ text: 'Yes.', words: 1 })
  })

  it('leaves the person alone when the agent is not being heard, whatever the words', () => {
    const guard = createEchoGuard()
    guard.said(SAID, 0)
    playing(guard, 0, 2000)
    const later = 2000 + TAIL_MS + 1000
    expect(guard.sift('What is on my plate today?', timed('What is on my plate today?', later), later + 2000))
      .toMatchObject({ text: 'What is on my plate today?', words: 6 })
  })

  it('places words without timings by when they arrived, allowing for the service being behind', () => {
    const guard = createEchoGuard()
    guard.said(SAID, 0)
    playing(guard, 0, 2000)
    expect(guard.sift('your plate is', undefined, 6000).text).toBe('')
    expect(guard.sift('book the meeting room', undefined, 6000).text).toBe('book the meeting room')
  })

  it('takes the person’s common words for theirs: only what the agent is saying around then is its echo', () => {
    const guard = createEchoGuard()
    // An earlier reply, then the current one, its first sentence playing from 20 s.
    guard.said('No, that is not what I have. Wait for the report, I meant to say.', 0)
    playing(guard, 0, 4_000)
    guard.said('Right now your plate is the walkthrough.', 20_000)
    playing(guard, 20_000, 23_000)
    const cut = guard.sift('no wait that is not what I meant', timed('no wait that is not what I meant', 21_000, 200), 23_000)
    expect(cut).toMatchObject({ text: 'no wait that is not what I meant', words: 8 })
  })

  it('follows the agent’s words in order, misheard ones too, and finds the person where their own words begin', () => {
    const guard = createEchoGuard()
    guard.said('Right now your plate is the walkthrough and the morning check.', 0)
    playing(guard, 0, 3_000)
    guard.said('No wait, there is one more thing.', 3_000)
    playing(guard, 3_000, 6_000)
    // "and" heard as "in" and "wait" as "way", in the agent's order; then the person's "no", a word the agent also said.
    const heard = 'in the morning check no way no that\'s not what I meant'
    const cut = guard.sift(heard, timed(heard, 2_600, 250), 6_000)
    expect(cut).toMatchObject({ text: 'no that\'s not what I meant', words: 6 })
    const echoOnly = 'in the morning check no way'
    expect(guard.sift(echoOnly, timed(echoOnly, 2_600, 250), 6_000).text).toBe('')
  })

  it('compares words with the sentence heard then, not one heard later', () => {
    const guard = createEchoGuard()
    guard.said('Right now your plate is the walkthrough.', 0)
    playing(guard, 0, 2_000)
    guard.said('Stop me if you want to ask something else.', 2_000)
    playing(guard, 2_000, 6_000)
    // Said over the first sentence; the service's word for it arrives once the second is playing.
    expect(guard.sift('stop I want to ask something else', timed('stop I want to ask something else', 300, 150), 6_000).words).toBe(7)
  })

  it('forgets on reset', () => {
    const guard = createEchoGuard()
    guard.said(SAID, 0)
    playing(guard, 0, 2000)
    guard.reset()
    expect(guard.sift('your plate', timed('your plate', 1000), 3000).text).toBe('your plate')
  })
})

/**
 * Recorded through AssemblyAI with voice's settings: macOS `say` speaking an agent's reply, filtered, quietened and
 * given a room's reverb as a laptop's speakers would give it back, streamed in real time from 0.5 s. In the second, a
 * second voice says "No, stop. I meant the other task, the one from yesterday." over it from 3.5 s.
 */
type Line = { at: number; msg?: { type: string; transcript?: string; end_of_turn?: boolean; words?: { text: string; start: number }[] } }
const AGENT = 'Right now your plate is the walkthrough, the morning check, and two tasks due today. A second of lag is about what you should expect from the speech service.'
const AGENT_FROM = 500
const AGENT_TO = 8_860

function replay(fixture: string, onlyAgentUntil = AGENT_TO) {
  const lines = readFileSync(join(__dirname, 'fixtures', fixture), 'utf8').trim().split('\n').map(l => JSON.parse(l) as Line)
  // Sent in real time from the socket's opening: stream time is capture time.
  const clock = createStreamClock()
  for (let t = 0; t < 20_000; t += 100) clock.sent(100, t + 100)
  const guard = createEchoGuard()
  guard.said(AGENT, 0)
  playing(guard, AGENT_FROM, onlyAgentUntil)
  return lines.filter(l => l.msg?.type === 'Turn' && l.msg.transcript).map(l => {
    const words = l.msg!.words!.map(w => ({ text: w.text, at: clock.capturedAt(w.start) }))
    return { final: l.msg!.end_of_turn === true, heard: l.msg!.transcript!, ...guard.sift(l.msg!.transcript!, words, l.at) }
  })
}

describe('recorded: the agent heard back through the speakers @SC-1002', () => {
  it('turns none of it into the person’s words, though the service writes all of it down', () => {
    const results = replay('assemblyai-echo.jsonl')
    expect(results.some(r => r.final && r.heard.includes('second of lag'))).toBe(true)
    expect(results.filter(r => r.text !== '')).toEqual([])
  })

  it('finds the person speaking over it: a cut-in at their second word, and only their words sent', () => {
    const results = replay('assemblyai-cut-in.jsonl')
    const cutIn = results.find(r => r.words >= 2)!
    // The service's words run ahead of its transcript: "stop" is timed before the transcript shows it.
    expect(cutIn.heard).toMatch(/morning check no$/)
    expect(cutIn.text).toBe('no stop')
    expect(results.find(r => r.final)!.text).toBe('no stop. I meant the other task, the one from yesterday.')
  })
})
