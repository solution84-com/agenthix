/**
 * The reply's tone tag (spec §The heavy model → *Its tone*): read and taken out as the step streams, whole or split
 * across pieces; a bad tag is taken out and is calm; no tag leaves the text as written.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceHumTone } from '@agenthix/core'
import { tagTone, toneTagReader } from '../toneTag'

function run(pieces: string[]) {
  const tones: VoiceHumTone[] = []
  const reader = toneTagReader(t => tones.push(t))
  const out = pieces.map(p => reader.take(p)).join('') + reader.flush()
  return { out, tones }
}

describe('the tone tag @SC-2235', () => {
  it('is read and taken out whole', () => {
    expect(run(['[tone: gentle] I am sorry to hear that.'])).toEqual({ out: 'I am sorry to hear that.', tones: ['gentle'] })
  })

  it('is read when it comes split across pieces, and nothing of it goes on', () => {
    const reader = toneTagReader(() => {})
    expect(reader.take('[to')).toBe('')
    expect(reader.take('ne: bri')).toBe('')
    expect(reader.take('ght]')).toBe('')
    expect(reader.take(' That')).toBe('That')
    expect(reader.take(' is great.')).toBe(' is great.')
    expect(run(['  [', 'tone', ':', ' warm', ']', '\n', 'Hello', ' there.'])).toEqual({ out: 'Hello there.', tones: ['warm'] })
  })

  it('a tag naming no tone hq knows is taken out, and is calm', () => {
    expect(run(['[tone: excited] Wow.'])).toEqual({ out: 'Wow.', tones: ['calm'] })
    expect(run(['[TONE:Thoughtful] Hmm.'])).toEqual({ out: 'Hmm.', tones: ['thoughtful'] })
  })

  it('a bare tone word in brackets counts as a tag', () => {
    expect(run(['[curious] ', 'Tell me more.'])).toEqual({ out: 'Tell me more.', tones: ['curious'] })
  })

  it('no tag: the text goes on as written, from the first piece that shows it', () => {
    const reader = toneTagReader(() => {})
    expect(reader.take('Sure')).toBe('Sure')
    expect(run(['Sure, ', '[tone: warm] later.'])).toEqual({ out: 'Sure, [tone: warm] later.', tones: [] })
    expect(run(['[1] is the first note.'])).toEqual({ out: '[1] is the first note.', tones: [] })
    expect(run(['[see the link](x)'])).toEqual({ out: '[see the link](x)', tones: [] })
  })

  it('a step that ends on a tag cut short says nothing of it', () => {
    expect(run(['[tone: war'])).toEqual({ out: '', tones: [] })
    expect(run(['[tone: calm]'])).toEqual({ out: '', tones: ['calm'] })
  })

  it('tagTone reads a complete tag, or says it is none', () => {
    expect(tagTone('[tone: bright]')).toBe('bright')
    expect(tagTone('[tone:]')).toBe('calm')
    expect(tagTone('[hello]')).toBeNull()
  })
})
