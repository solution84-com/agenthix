import { describe, it, expect } from 'vitest'
import { claimsStart, madeLabel, madeForLead, startedLine, startsAtWords } from '../startedWords'
import type { StepCall } from '../replySteps'

const at = new Date('2026-10-17T22:00:00Z')
const accepted = { status: 'accepted' as const, operationId: 'op' }
const started = (title: string, place?: string): StepCall =>
  ({ call: { id: title, name: 'start_work', input: {} }, outcome: accepted, title, made: 'started', ...(place ? { place } : {}) })
const set = (title: string): StepCall =>
  ({ call: { id: title, name: 'create_task', input: {} }, outcome: accepted, title, made: 'set', startsAt: at })

describe('when a task for a time starts, in words @SC-968', () => {
  it("is the day, the date and the time in the person's timezone", () => {
    expect(startsAtWords(at, 'Australia/Sydney')).toBe('Sun 18 Oct, 9:00')
  })

  it('is UTC, said so, when the person has no timezone', () => {
    expect(startsAtWords(at, null)).toBe('Sat 17 Oct, 22:00 UTC')
  })
})

describe("a step that made something, as the reply's step shows it @SC-968", () => {
  it('names the work started and where, or the task set and when', () => {
    expect(madeLabel(started('List every file', 'your space'), null)).toBe('Started "List every file" · your space')
    expect(madeLabel(started('List every file'), null)).toBe('Started "List every file"')
    expect(madeLabel(set('WAL-4 Morning check'), 'Australia/Sydney')).toBe('Set "WAL-4 Morning check" to start Sun 18 Oct, 9:00')
  })
})

describe("hq's line for a step that only started work and said nothing @SC-968", () => {
  it('names each piece started', () => {
    expect(startedLine([started('List every file in my space'), started('List every file in Walkthrough')], null))
      .toBe("I've started: List every file in my space; List every file in Walkthrough.")
  })

  it('names a task set for a time, and when it starts', () => {
    expect(startedLine([set('WAL-4 Morning check')], 'Australia/Sydney')).toBe("I've set WAL-4 Morning check to start Sun 18 Oct, 9:00.")
  })

  it('names both in one line when the step did both', () => {
    expect(startedLine([started('Read my space'), set('WAL-4 Morning check')], 'Australia/Sydney'))
      .toBe("I've started: Read my space, and set WAL-4 Morning check to start Sun 18 Oct, 9:00.")
  })

  it('names work that waits for the okay to start, never as started', () => {
    const waiting: StepCall = { call: { id: 'w', name: 'start_work', input: {} }, outcome: { status: 'waitingApproval', operationId: 'o' }, title: 'Survey' }
    expect(startedLine([waiting], null)).toBe("I've asked for your okay to start: Survey.")
  })

  it('names each piece once when the same call was asked twice', () => {
    expect(startedLine([started('One'), started('One')], null)).toBe("I've started: One.")
  })
})

describe('what the agent reads back of what it made in a reply (walkthrough finding 34) @SC-968', () => {
  it('is hq\'s record, a line for each piece it started or set, never in the agent\'s voice; none for a lookup', () => {
    const steps = [
      { label: 'Your places', ms: 5 },
      { label: 'Started "List every file" · your space', ms: 5, made: 'started' as const },
      { label: 'Set "WAL-4 Morning check" to start Sun 18 Oct, 9:00', ms: 5, made: 'set' as const },
    ]
    expect(madeForLead(steps)).toBe('[Record: started "List every file" · your space]\n[Record: set "WAL-4 Morning check" to start Sun 18 Oct, 9:00]')
    expect(madeForLead([{ label: 'Your places', ms: 5 }])).toBeNull()
    expect(madeForLead(undefined)).toBeNull()
  })
})

describe('words that say work is starting (walkthrough finding 38) @SC-968', () => {
  it('are found in the first-person ways of saying so', () => {
    for (const words of [
      'Starting a fresh read of your space now — file by file.',
      "I've started reading every file in your space.",
      "I'm starting the read now.",
      'I have kicked off the review.',
      "I'll start on that now and tell you when it's done.",
      'Okay. Kicking off the profile of Shop.',
      "I've set Morning check to start tomorrow at 9:00.",
      'I am now running the benchmark in Shop.',
      'I’ve started the read.',
    ]) expect(claimsStart(words), words).toBe(true)
  })

  it('are not found in an answer that only talks about work', () => {
    for (const words of [
      'Your space holds three files.',
      'WAL-4 starts tomorrow at 9:00.',
      'Do you want me to start it?',
      'I could start a read of your space if you like.',
      '',
    ]) expect(claimsStart(words), words).toBe(false)
  })
})
