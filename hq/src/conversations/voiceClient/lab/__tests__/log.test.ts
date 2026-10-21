import { describe, expect, it } from 'vitest'
import type { VoiceEvent } from '../../events'
import { parseLog, serializeLog } from '../log'

const events: VoiceEvent[] = [
  { kind: 'acoustic.vadScore', confidence: 0.8, t: 10, seq: 0 },
  { kind: 'audio.frame', pcm: new Int16Array(512).fill(7), t: 12, seq: 1 },
  { kind: 'stt.words', text: 'hello', words: [], committed: true, order: 0, t: 40, seq: 2 },
  { kind: 'reply.audio', replyId: 'r1', index: 0, pcm24k: new ArrayBuffer(96), t: 50, seq: 3 },
]

describe('the saved log', () => {
  it('round-trips the events, the settings version and the overflows', () => {
    const text = serializeLog(events, [{ loop: 'inbound', dropped: events[0]!, at: 99 }], 3, new Date('2026-10-19T10:00:00Z'))
    const loaded = parseLog(text)
    expect(loaded.events.map(e => [e.kind, e.t, e.seq])).toEqual(events.map(e => [e.kind, e.t, e.seq]))
    expect(loaded.events[2]).toMatchObject({ kind: 'stt.words', text: 'hello', committed: true })
    expect(loaded.settingsVersion).toBe(3)
    expect(loaded.overflows).toEqual([{ loop: 'inbound', at: 99, droppedKind: 'acoustic.vadScore', droppedSeq: 0 }])
  })

  it('keeps no audio, only its size', () => {
    const loaded = parseLog(serializeLog(events, [], null))
    expect(loaded.events[1]).toMatchObject({ kind: 'audio.frame', pcm: { samples: 512 } })
    expect(loaded.events[3]).toMatchObject({ kind: 'reply.audio', pcm24k: { bytes: 96 } })
    expect(serializeLog(events, [], null)).not.toContain('"7,7')
  })

  it('refuses what is not a saved log, in words', () => {
    expect(() => parseLog('nope')).toThrow('not JSON')
    expect(() => parseLog('{"a":1}')).toThrow('not a saved voice log')
    expect(() => parseLog('{"format":"voice-log","version":9,"events":[]}')).toThrow('version 9')
    expect(() => parseLog('{"format":"voice-log","version":1}')).toThrow('no list of events')
    expect(() => parseLog('{"format":"voice-log","version":1,"events":[{"kind":"x"}]}')).toThrow('Event 1')
  })
})

describe('a log recorded under another settings version @SC-1137', () => {
  it('shows the version it was recorded under and applies nothing from it', async () => {
    const { VOICE_SETTINGS } = await import('../../settings')
    const loaded = parseLog(serializeLog(events, [], 8))
    expect(loaded.settingsVersion).toBe(8)
    expect(Object.keys(loaded).sort()).toEqual(['events', 'overflows', 'settingsVersion'])
    expect(VOICE_SETTINGS.version).toBe(1)
  })

  it('reads a settings version that is not a number as unknown', () => {
    const loaded = parseLog('{"format":"voice-log","version":1,"settingsVersion":"8","events":[]}')
    expect(loaded.settingsVersion).toBeNull()
  })
})
