import { describe, expect, it } from 'vitest'
import { runLineWords } from '../taskRunLines'

const now = new Date(2026, 10, 6, 9, 12)
const run = (over: object) => ({ id: 'r', status: 'COMPLETED', createdAt: new Date(2026, 10, 6, 7, 54), endedAt: new Date(2026, 10, 6, 7, 55), startedBy: 'started by you', ...over })

describe("a task's run as one line", () => {
  it('is titled by the number HQ stored, not by its place', () => {
    expect(runLineWords(run({ number: 7 }), { now }).title).toBe('Run 7')
    expect(runLineWords(run({ number: null }), { now }).title).toBe('Run')
  })

  it('says what it did, who started it, when and how long', () => {
    expect(runLineWords(run({ number: 1, result: 'Two footer links are broken.\nMore.' }), { now })).toMatchObject({
      what: 'Two footer links are broken.', facts: 'by you · 07:54 · 1 min', tone: 'done', live: false,
    })
    expect(runLineWords(run({ number: 1 }), { now }).what).toBe('Finished without a result')
  })

  it('says what a live run is doing, since when', () => {
    expect(runLineWords(run({ number: 2, status: 'RUNNING', createdAt: new Date(2026, 10, 6, 9, 11), endedAt: null }), { now, doing: 'Checking the Contact page' }))
      .toMatchObject({ what: 'Checking the Contact page', facts: 'by you · since 09:11 · 1 min', live: true, tone: 'live' })
  })

  it('says a failure with its reason, a stop, and a wait for an okay', () => {
    expect(runLineWords(run({ status: 'FAILED', error: 'the model provider was overloaded' }), { now }).what).toBe('Failed · the model provider was overloaded')
    expect(runLineWords(run({ status: 'CANCELLED' }), { now }).what).toBe('Stopped')
    expect(runLineWords(run({ status: 'RUNNING', endedAt: null }), { now, waiting: true }).what).toBe('Waiting for your okay')
  })
})
