import { describe, expect, it } from 'vitest'
import { handRaiseWords, rightButton, speakerOf, speakerWords, voiceHere, voiceLength, voiceLineOf, voiceLineWords } from '../voiceUi'

const base = { hasText: false, running: false, inVoice: false, available: true, reason: null, heldByOther: false }

describe('the right button @SC-1007', () => {
  it('is voice when empty, send with text, stop while a reply runs', () => {
    expect(rightButton(base)).toEqual({ kind: 'voice', disabledReason: null })
    expect(rightButton({ ...base, hasText: true })).toEqual({ kind: 'send' })
    expect(rightButton({ ...base, running: true })).toEqual({ kind: 'stop' })
    expect(rightButton({ ...base, hasText: true, running: true })).toEqual({ kind: 'send' })
  })
  it('is greyed with hq’s reason, or one of its own, or because someone else holds voice', () => {
    expect(rightButton({ ...base, available: false, reason: 'No voice.' })).toEqual({ kind: 'voice', disabledReason: 'No voice.' })
    expect(rightButton({ ...base, available: false })).toEqual({ kind: 'voice', disabledReason: 'Voice is not available here.' })
    expect(rightButton({ ...base, heldByOther: true })).toMatchObject({ kind: 'voice', disabledReason: expect.stringContaining('Someone else') })
  })
  it('ends the call, in a call, until the person types', () => {
    expect(rightButton({ ...base, inVoice: true })).toEqual({ kind: 'end' })
    expect(rightButton({ ...base, inVoice: true, running: true })).toEqual({ kind: 'end' })
    expect(rightButton({ ...base, inVoice: true, hasText: true })).toEqual({ kind: 'send' })
  })
})

describe('who is talking @SC-1001', () => {
  it('is the person while words come in, the agent while it plays, otherwise listening', () => {
    expect(speakerOf({ phase: 'listening', muted: false, partial: 'hel' })).toBe('person')
    expect(speakerOf({ phase: 'speaking', muted: false, partial: '' })).toBe('agent')
    expect(speakerOf({ phase: 'thinking', muted: false, partial: '' })).toBe('listening')
    expect(speakerOf({ phase: 'speaking', muted: true, partial: '' })).toBe('muted')
    expect(speakerOf({ phase: 'off', muted: false, partial: '' })).toBe('none')
  })
  it('says it in words', () => {
    expect(speakerWords('agent', 'Kernel')).toBe('Kernel is speaking')
    expect(speakerWords('person', 'Kernel')).toBe('You are speaking')
  })
})

describe('how long voice ran @SC-1001', () => {
  it('reads in seconds, minutes and hours', () => {
    expect(voiceLength(40_000)).toBe('40 s')
    expect(voiceLength(240_000)).toBe('4 min')
    expect(voiceLength(3_900_000)).toBe('1 h 5 min')
  })
})

describe('what the pill says of voice itself', () => {
  it('names who raised a hand, and how to hear them', () => {
    expect(handRaiseWords('Kernel')).toBe('Kernel has an update. Tap to hear it now.')
    expect(handRaiseWords(undefined)).toBe('An agent has an update. Tap to hear it now.')
  })
})

describe('voice on a page that is not secure', () => {
  it('is greyed with words that say it needs https or this computer', () => {
    expect(voiceHere({ available: true, unavailableReason: null }, true)).toEqual({ available: true, reason: null })
    const here = voiceHere({ available: true, unavailableReason: null }, false)
    expect(here.available).toBe(false)
    expect(here.reason).toMatch(/https/)
    expect(here.reason).toMatch(/localhost/)
  })
  it('gives hq’s own reason first', () => {
    expect(voiceHere({ available: false, unavailableReason: 'No voice.' }, false)).toEqual({ available: false, reason: 'No voice.' })
  })
})

describe('the call bar when voice is about to end (decision 3) @SC-1933', () => {
  it('says so on the call bar, not in a dialog, until someone speaks', () => {
    expect(voiceLineOf({ phase: 'listening', reconnecting: false, warningEndsAt: 1_000 }, false)).toBe('ending')
    expect(voiceLineWords('ending', 'Kernel')).toBe('No one has spoken for a while. Voice ends in a few seconds unless you say something.')
    expect(voiceLineOf({ phase: 'listening', reconnecting: false, warningEndsAt: null }, false)).toBe('listening')
    expect(voiceLineOf({ phase: 'listening', reconnecting: true, warningEndsAt: 1_000 }, false)).toBe('reconnecting')
  })
})
