import { describe, expect, it } from 'vitest'
import { boundReached, settle } from '../decide'
import type { ListenerDecision } from '../../listener'

const d = (decision: ListenerDecision) => ({ decision })
const close = d({ tool: 'close_turn', say: 'Got it, I will stop.' })
const hand = d({ tool: 'hand_over', asked: 'the weather', answer: 'Sunny.', hold: 'Let me check the weather.' })
const ack = d({ tool: 'acknowledge', say: 'Right.' })
const invite = d({ tool: 'invite', say: 'Take your time.' })
const keep = d({ tool: 'keep_listening' })

describe('the sounds finished decision @SC-2203', () => {
  it('close_turn closes the turn alone, with its line', () => {
    expect(settle({ soundsFinished: true, result: close, stale: false })).toEqual({ send: true, say: 'Got it, I will stop.', turn: 'closed', keepOpen: false })
  })

  it('hand_over hands the turn to the heavy model, its hold playing', () => {
    expect(settle({ soundsFinished: true, result: hand, stale: false })).toEqual({ send: true, say: 'Let me check the weather.', turn: 'handedOver', keepOpen: false })
  })

  it.each([['keep_listening', keep, null], ['acknowledge', ack, 'Right.'], ['invite', invite, 'Take your time.']] as const)(
    '%s is "not yet": nothing ends, the turn stays open', (_name, result, say) => {
      expect(settle({ soundsFinished: true, result, stale: false })).toEqual({ send: true, say, turn: null, keepOpen: true })
    })

  it('no usable answer in time falls back to the heavy model', () => {
    expect(settle({ soundsFinished: true, result: 'timeout', stale: false }).turn).toBe('fallback')
    expect(settle({ soundsFinished: true, result: 'failed', stale: false }).turn).toBe('fallback')
  })

  it('a call that is not marked sounds finished never ends or keeps a turn', () => {
    expect(settle({ soundsFinished: false, result: ack, stale: false })).toEqual({ send: true, say: 'Right.', turn: null, keepOpen: false })
    expect(settle({ soundsFinished: false, result: 'timeout', stale: false })).toEqual({ send: true, say: null, turn: null, keepOpen: false })
  })
})

describe('stale answers @SC-2207', () => {
  it('play an acknowledgement, nothing else', () => {
    expect(settle({ soundsFinished: false, result: ack, stale: true }).say).toBe('Right.')
    expect(settle({ soundsFinished: false, result: invite, stale: true }).send).toBe(false)
    expect(settle({ soundsFinished: false, result: keep, stale: true }).send).toBe(false)
  })

  it('never end a turn: a close or a hand over to a superseded call is dropped', () => {
    expect(settle({ soundsFinished: true, result: close, stale: true })).toEqual({ send: false, say: null, turn: null, keepOpen: false })
    expect(settle({ soundsFinished: true, result: hand, stale: true }).turn).toBeNull()
  })

  it('a late timeout to a superseded call falls back to nothing', () => {
    expect(settle({ soundsFinished: true, result: 'timeout', stale: true }).send).toBe(false)
  })
})

describe('the bound on "not yet" @SC-2206', () => {
  it('is reached by the silence the browser measured or by the time since the turn was kept open', () => {
    expect(boundReached(60_000, 1000, 2000, 60_000)).toBe(true)
    expect(boundReached(5000, 0, 60_000, 60_000)).toBe(true)
    expect(boundReached(5000, 0, 30_000, 60_000)).toBe(false)
  })
})
