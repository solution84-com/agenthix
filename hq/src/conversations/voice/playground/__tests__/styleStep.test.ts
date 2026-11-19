/**
 * The playground's second step after a listening style (`styleStep.ts`): only when the first step called
 * set_listening_style, held nothing and said nothing; every call answered as hq's turn would tell the model.
 */
import { describe, expect, it } from 'vitest'
import { styleFollowUp } from '../styleStep'

const style = (s: string, id = 'c1') => ({ id, name: 'set_listening_style', input: { style: s } })

describe('the second step after a listening style @SC-2232', () => {
  it('carries the step and the style as set, for the reply to say it will', () => {
    expect(styleFollowUp({ text: '', calls: [style('hums_off')], held: false }, () => true)).toEqual([
      { role: 'assistant', content: '', toolCalls: [style('hums_off')] },
      { role: 'tool', toolCallId: 'c1', toolName: 'set_listening_style', result: { style: 'hums_off', set: true } },
    ])
  })

  it('answers a style not set as refused, and a stand-in start_work beside it as accepted', () => {
    const after = styleFollowUp({ text: ' ', calls: [style('patient'), { id: 'w1', name: 'start_work', input: {} }], held: false }, () => false)!
    expect(after[1]).toMatchObject({ result: { status: 'refused' } })
    expect(after[2]).toMatchObject({ toolName: 'start_work', result: { status: 'accepted' } })
  })

  it('is none when the step said something, held, or set no style', () => {
    expect(styleFollowUp({ text: 'Sure, no more hums.', calls: [style('hums_off')], held: false }, () => true)).toBeNull()
    expect(styleFollowUp({ text: '', calls: [style('hums_off')], held: true }, () => true)).toBeNull()
    expect(styleFollowUp({ text: '', calls: [{ id: 'w1', name: 'start_work', input: {} }], held: false }, () => true)).toBeNull()
  })
})
