import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readSpeechMessage } from '../../voiceClient/speechInput'
import { beginDictation, editText, hearSpeech, movePosition, turnOpen, type DictationText } from '../dictationText'

type Line = { at: number; msg?: unknown; sent?: string }

/** Messages recorded from AssemblyAI's v3 streaming API (u3-rt-pro), one JSON line each, with what was sent. */
function recording(name: string): Line[] {
  const raw = readFileSync(join(__dirname, '../../voiceClient/__tests__/fixtures', name), 'utf8')
  return raw.trim().split('\n').map(l => JSON.parse(l) as Line)
}

function replay(state: DictationText, lines: Line[], until?: string): DictationText {
  for (const line of lines) {
    if (until && line.sent === until) break
    if (!line.msg) continue
    const m = readSpeechMessage(JSON.stringify(line.msg))
    if (m && m.kind !== 'error') state = hearSpeech(state, { text: m.text, order: m.order, final: m.kind === 'turn' })
  }
  return state
}

const heard = (state: DictationText, text: string, order: number, final = false) => hearSpeech(state, { text, order, final })

describe('dictation, from a recording of the speech service @SC-1003', () => {
  it('keeps every turn of speech with pauses in it: a later turn never replaces an earlier one', () => {
    const done = replay(beginDictation(''), recording('assemblyai-pauses.jsonl'))
    expect(done.text).toBe('So it started capturing. This is a test. I want to see how well this is actually working. And one more thing, keep the start.')
  })

  it('shows the words of a turn the service has not finished, where it stands', () => {
    const atStop = replay(beginDictation(''), recording('assemblyai-pauses.jsonl'), 'Terminate')
    expect(atStop.text).toBe('So it started capturing. This is a test. I want to see how well this is actually working.')
    expect(turnOpen(atStop)).toBe(true)
  })

  it('reads the start of what was said from audio held until the socket opened', () => {
    const done = replay(beginDictation(''), recording('assemblyai-held-audio.jsonl'))
    expect(done.text.startsWith('So it started capturing. This is a test.')).toBe(true)
  })

  it('ends the turn when asked to, with the formatted words', () => {
    const lines = recording('assemblyai-force-endpoint.jsonl')
    const before = replay(beginDictation(''), lines, 'ForceEndpoint')
    expect(turnOpen(before)).toBe(true)
    const after = replay(beginDictation(''), lines)
    expect(turnOpen(after)).toBe(false)
    expect(after.text).toBe('So it started capturing. This is a test. I want to see how well this is actually working. And one more thing, keep the start')
  })
})

describe('the heard words in the box @SC-1003', () => {
  it('replaces a turn’s raw words with its formatted sentence in place', () => {
    let s = heard(beginDictation(''), 'so it started', 0)
    s = heard(s, 'This is', 1)
    s = heard(s, 'So it started capturing.', 0, true)
    expect(s.text).toBe('So it started capturing. This is')
  })

  it('goes after what was already typed, with a space between', () => {
    expect(heard(beginDictation('Note:'), 'hello', 0).text).toBe('Note: hello')
    expect(heard(beginDictation('Note: '), 'hello', 0).text).toBe('Note: hello')
  })

  it('goes where the cursor was, keeping the text after it', () => {
    expect(heard(beginDictation('Dear , thanks', 5), 'Sam', 0).text).toBe('Dear Sam, thanks')
  })

  it('keeps what the person types before the heard words and moves them along', () => {
    let s = heard(beginDictation('Hi'), 'one two', 0)
    s = editText(s, 'Hi there one two')
    s = heard(s, 'One, two, three.', 0, true)
    expect(s.text).toBe('Hi there One, two, three.')
  })

  it('keeps what the person types after the heard words', () => {
    let s = heard(beginDictation(' later', 0), 'one', 0)
    expect(s.text).toBe('one later')
    s = editText(s, 'one later!')
    s = heard(s, 'One, two.', 0, true)
    expect(s.text).toBe('One, two. later!')
  })

  it('hands heard words to the person who edits them, and puts later words after them', () => {
    let s = heard(beginDictation(''), 'This is a', 0)
    s = editText(s, 'This was a')
    expect(s.text).toBe('This was a')
    s = heard(s, 'This is a test', 0)
    expect(s.text).toBe('This was a test')
    s = heard(s, 'This is a test.', 0, true)
    expect(s.text).toBe('This was a test.')
    s = heard(s, 'More', 1)
    expect(s.text).toBe('This was a test. More')
  })

  it('takes the end of the box as the person’s when they type right after the heard words', () => {
    let s = heard(beginDictation(''), 'Hello', 0, true)
    s = editText(s, 'Hello!')
    s = heard(s, 'Again', 1)
    expect(s.text).toBe('Hello! Again')
  })
})

describe('the cursor while words are rewritten @SC-1003', () => {
  it('hands a finished turn over too: a correction of it never writes back over the person’s edit', () => {
    const done = heard(beginDictation(''), 'Old words.', 0, true)
    const cleared = editText(done, '')
    expect(heard(cleared, 'Old words, corrected.', 0, true).text).toBe('')
    expect(heard(cleared, 'next', 1).text).toBe('next')
  })

  it('stays put before the heard words and moves with the text after them', () => {
    const a = heard(beginDictation('ab cd', 2), 'x', 0)
    const b = heard(a, 'xyz', 0)
    expect(a.text).toBe('ab x cd')
    expect(b.text).toBe('ab xyz cd')
    expect(movePosition(a, b, 1)).toBe(1)
    expect(movePosition(a, b, 6)).toBe(8)
  })

  it('follows the words when it stood where they go in', () => {
    const a = beginDictation('', 0)
    const b = heard(a, 'hello', 0)
    expect(movePosition(a, b, 0)).toBe(5)
  })
})
