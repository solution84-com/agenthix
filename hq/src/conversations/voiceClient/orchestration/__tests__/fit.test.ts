import { describe, expect, it } from 'vitest'
import { fitOf, tiersFor, type Fit } from '../fit'

/** A small labelled set: what the person had said when they paused mid-thought, and what kind of words they were. */
const LABELLED: Array<[text: string, fit: Fit]> = [
  // Questions
  ['What do you think we should do about the launch?', 'question'],
  ['So the real question is, why did the build fail twice', 'question'],
  ['Is there a way to see the old version', 'question'],
  ['How long would that take', 'question'],
  ['I was wondering. Do you know who owns the billing page?', 'question'],
  ['Which of the two is cheaper', 'question'],
  // Requests
  ['Can you move the meeting to Thursday', 'request'],
  ['Could you draft a reply to Sam', 'request'],
  ['Please send the notes to the team', 'request'],
  ['I need you to check the numbers in the report', 'request'],
  ['Remind me tomorrow about the invoice', 'request'],
  ['Okay. Write it up as a short summary', 'request'],
  ["Let's put the review on Friday", 'request'],
  // Tellings
  ['So yesterday I spent most of the afternoon on the migration', 'telling'],
  ['The customer called again this morning, and they were pretty upset', 'telling'],
  ['We tried the new layout last week. It went better than expected', 'telling'],
  ['My manager thinks the plan is too long', 'telling'],
  ['It started when the server ran out of memory', 'telling'],
  ['I have been thinking about moving the team to a four day week', 'telling'],
  // Mid-clause: the last word cannot end a clause
  ['So yesterday I spent most of the afternoon on the', 'mid-clause'],
  ['We could move it to Thursday and', 'mid-clause'],
  ['The reason I ask is because', 'mid-clause'],
  ['I think um', 'mid-clause'],
  // Too little to tell
  ['', 'too-little'],
  ['so', 'too-little'],
]

describe('the fit of a listening sound to the last words', () => {
  it.each(LABELLED)('reads %j as %s', (text, fit) => {
    expect(fitOf(text)).toBe(fit)
  })

  it('gets the labelled set right', () => {
    const right = LABELLED.filter(([text, fit]) => fitOf(text) === fit).length
    expect(right).toBe(LABELLED.length)
  })

  it('offers acknowledging words only to a telling; a question or request gets a hum', () => {
    expect(tiersFor('telling', false)).toEqual(['hum', 'acknowledge'])
    expect(tiersFor('question', false)).toEqual(['hum'])
    expect(tiersFor('request', false)).toEqual(['hum'])
  })

  it('offers nothing mid-clause until the longest wait has passed, then a hum; nothing when there is too little', () => {
    expect(tiersFor('mid-clause', false)).toEqual([])
    expect(tiersFor('mid-clause', true)).toEqual(['hum'])
    expect(tiersFor('too-little', true)).toEqual([])
    expect(tiersFor('telling', true)).toEqual(['hum', 'acknowledge'])
  })
})
