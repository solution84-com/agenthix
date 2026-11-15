import { describe, expect, it } from 'vitest'
import { buildSpeechUrl, readSpeechMessage, rms } from '../speechInput'

describe('the speech service’s frames @SC-995', () => {
  it('reads words still being spoken as partial', () => {
    expect(readSpeechMessage(JSON.stringify({ type: 'Turn', transcript: 'hello wor', end_of_turn: false }))).toEqual({ kind: 'partial', text: 'hello wor', order: null, words: [] })
  })
  it('ends a turn on the formatted end of turn, and only that one', () => {
    expect(readSpeechMessage(JSON.stringify({ type: 'Turn', transcript: 'hello world', end_of_turn: true, turn_is_formatted: false }))).toEqual({ kind: 'partial', text: 'hello world', order: null, words: [] })
    expect(readSpeechMessage(JSON.stringify({ type: 'Turn', transcript: 'Hello, world.', end_of_turn: true, turn_is_formatted: true }))).toEqual({ kind: 'turn', text: 'Hello, world.', order: null, words: [] })
  })
  it('carries the turn’s number, which ties a turn heard again to the one before', () => {
    expect(readSpeechMessage(JSON.stringify({ type: 'Turn', transcript: 'Look through', end_of_turn: false, turn_order: 3 }))).toEqual({ kind: 'partial', text: 'Look through', order: 3, words: [] })
    expect(readSpeechMessage(JSON.stringify({ type: 'Turn', transcript: 'Look.', end_of_turn: true, turn_is_formatted: true, turn_order: 3 }))).toEqual({ kind: 'turn', text: 'Look.', order: 3, words: [] })
  })
  it('carries each word with where it starts in the audio sent', () => {
    const msg = readSpeechMessage(JSON.stringify({ type: 'Turn', transcript: 'Hi there', end_of_turn: false, words: [{ text: 'Hi', start: 40, end: 120 }, { text: 'there', start: 160 }, { text: 7 }] }))
    expect(msg).toMatchObject({ words: [{ text: 'Hi', start: 40 }, { text: 'there', start: 160 }] })
  })
  it('ignores empty turns and frames it does not know', () => {
    expect(readSpeechMessage(JSON.stringify({ type: 'Turn', transcript: '  ', end_of_turn: true }))).toBeNull()
    expect(readSpeechMessage(JSON.stringify({ type: 'Begin' }))).toBeNull()
    expect(readSpeechMessage('not json')).toBeNull()
  })
  it('passes an error on', () => {
    expect(readSpeechMessage(JSON.stringify({ type: 'Error', error: 'quota' }))).toEqual({ kind: 'error', message: 'quota' })
  })
  it('puts the token and the organisation’s settings in the address', () => {
    const url = buildSpeechUrl('tok', { keyterms_prompt: ['Kernel'], speech_model: 'x' })
    expect(url).toContain('token=tok')
    expect(url).toContain('keyterms_prompt=Kernel')
    expect(url).toContain('speech_model=x')
  })
})

describe('the audio\'s loudness @SC-997', () => {
  it('measures loudness', () => {
    expect(rms(new Int16Array([0, 0, 0]))).toBe(0)
    expect(rms(new Int16Array([16384, -16384]))).toBeCloseTo(0.5)
  })
})
