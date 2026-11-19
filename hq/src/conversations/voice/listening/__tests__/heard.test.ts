import { describe, expect, it, vi } from 'vitest'
import type { TurnSpeech } from '../../session'
import { withHeardLines } from '../heard'
import { ListeningState, joinHeard, replyOf } from '../state'

function speech(said: Partial<ReturnType<TurnSpeech['end']>> = {}): TurnSpeech {
  return {
    text: vi.fn(),
    end: vi.fn((_s, full: string) => ({ text: full, interrupted: false, ...said })),
    written: vi.fn(),
    hold: vi.fn(),
    heardPrefix: vi.fn(),
  }
}

function heardState(...lines: string[]): ListeningState {
  const state = new ListeningState()
  lines.forEach((l, i) => state.sent(`l${i}`, l))
  state.awaitingReply = true
  return state
}

describe('what the person heard, stored with the reply @SC-2215', () => {
  it('starts the agent message, in order, then the reply; the recap follows once it is written @SC-2217', () => {
    const state = heardState('Mm-hm.', 'Ooh, let me check the weather.')
    const after = vi.fn()
    const turn = withHeardLines(speech(), 't1', state, after)
    const said = turn.end('COMPLETED', 'It is sunny in Melbourne.')
    expect(said.text).toBe('Mm-hm. Ooh, let me check the weather.\n\nIt is sunny in Melbourne.')
    expect(state.awaitingReply).toBe(false)
    expect(state.turnOver).toBe(true)
    expect(after).not.toHaveBeenCalled()
    turn.written('msg-1')
    expect(after).toHaveBeenCalledWith('Mm-hm. Ooh, let me check the weather.\n\nIt is sunny in Melbourne.', expect.any(AbortSignal))
    // Taken once: the next turn starts with none.
    expect(state.takeLines()).toEqual([])
  })

  it('tells the holder the lines that start the message, so the reply\'s words are placed after them', () => {
    const base = speech()
    withHeardLines(base, 't1', heardState('Mm-hm.', 'Let me check.'), vi.fn()).end('COMPLETED', 'It is sunny.')
    expect(base.heardPrefix).toHaveBeenCalledWith('Mm-hm. Let me check.')
    const none = speech()
    withHeardLines(none, 't2', heardState(), vi.fn()).end('COMPLETED', 'Hello.')
    expect(none.heardPrefix).not.toHaveBeenCalled()
  })

  it('reads the reply alone when nothing was heard', () => {
    const turn = withHeardLines(speech(), 't1', heardState(), vi.fn())
    expect(turn.end('COMPLETED', 'Hello.').text).toBe('Hello.')
  })

  it('writes no recap for an interrupted reply, and keeps the lines heard @SC-2217', () => {
    const after = vi.fn()
    const turn = withHeardLines(speech({ text: 'It is', interrupted: true }), 't1', heardState('Let me look.'), after)
    expect(turn.end('CANCELLED', 'It is sunny.').text).toBe('Let me look.\n\nIt is')
    turn.written('msg-1')
    expect(after).not.toHaveBeenCalled()
  })

  it('leaves the lines for the turn that answers again when the person went on @SC-2212', () => {
    const state = heardState('Let me look.')
    const turn = withHeardLines(speech({ text: '', interrupted: true, withdrawn: true }), 't1', state, vi.fn())
    turn.end('CANCELLED', 'It is')
    expect(state.awaitingReply).toBe(true)
    expect(state.takeLines()).toEqual(['Let me look.'])
  })

  it('a reply written whole, then withdrawn as the person went on, hands its lines to the reply that answers again, and its recap is stopped @SC-2212 @SC-2217', () => {
    const state = heardState('Right, let me think about that rota.')
    const after = vi.fn()
    const first = withHeardLines(speech(), 't1', state, after)
    expect(first.end('COMPLETED', 'I can draft one.').text).toBe('Right, let me think about that rota.\n\nI can draft one.')
    first.written('msg-1')
    const unheard = after.mock.calls[0]![1] as AbortSignal
    expect(unheard.aborted).toBe(false)
    state.sent('l9', 'Mm-hm.')

    state.replyUnheard('t1', true)
    expect(unheard.aborted).toBe(true)
    expect(state.prefixOf('t1')).toBeUndefined()
    expect(state.awaitingReply).toBe(true)
    const again = withHeardLines(speech(), 't2', state, vi.fn())
    expect(again.end('COMPLETED', 'Five people over seven days.').text)
      .toBe('Right, let me think about that rota. Mm-hm.\n\nFive people over seven days.')
  })

  it('a reply written whole, then cut by the person speaking over it, keeps its lines and its recap is stopped @SC-2217', () => {
    const state = heardState('Let me look.')
    const after = vi.fn()
    const turn = withHeardLines(speech(), 't1', state, after)
    turn.end('COMPLETED', 'It is sunny. And warm.')
    turn.written('msg-1')
    state.replyUnheard('t1', false)
    expect((after.mock.calls[0]![1] as AbortSignal).aborted).toBe(true)
    expect(state.prefixOf('t1')).toBe('Let me look.')
    expect(state.takeLines()).toEqual([])
  })

  it('a later reply\'s recap is not stopped by an older one going unheard', () => {
    const state = heardState()
    const after = vi.fn()
    for (const id of ['t1', 't2']) {
      const turn = withHeardLines(speech(), id, state, after)
      turn.end('COMPLETED', 'Sure.')
      turn.written(`msg-${id}`)
    }
    state.replyUnheard('t1', false)
    expect(after.mock.calls.map(c => (c[1] as AbortSignal).aborted)).toEqual([true, false])
  })

  it('keeps a line that could not be made out', () => {
    const state = heardState('Mm-hm.', 'Right.')
    state.drop('l0')
    expect(state.takeLines()).toEqual(['Right.'])
  })

  it('a later cut keeps the heard lines and cuts only the reply', () => {
    const { text, prefix } = joinHeard(['Let me look.'], 'First. Second.')
    expect(replyOf(text, prefix)).toBe('First. Second.')
    expect(replyOf('First.', undefined)).toBe('First.')
  })
})
