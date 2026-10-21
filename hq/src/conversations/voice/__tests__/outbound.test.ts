import { describe, expect, it } from 'vitest'
import { audioMs, PlaybackTimeline } from '../outbound'

describe('the outbound buffer: where the holder has got to', () => {
  it('plays each sentence after the one before, for as long as its audio lasts', () => {
    const t = new PlaybackTimeline()
    t.sent(0, 1000)
    t.sent(0, 500)
    expect(t.unheard(0)).toBe(2)
    expect(t.unheard(1000)).toBe(1)
    expect(t.speakingUntil()).toBe(1500)
    expect(t.unheard(1500)).toBe(0)
    expect(t.speakingUntil()).toBe(1500)
  })

  it('starts a sentence sent after a pause when it is sent', () => {
    const t = new PlaybackTimeline()
    t.sent(0, 100)
    t.sent(5000, 100)
    expect(t.speakingUntil()).toBe(5100)
  })

  it('says how long until fewer than the limit are unheard', () => {
    const t = new PlaybackTimeline()
    expect(t.waitMs(0, 2)).toBe(0)
    t.sent(0, 1000)
    expect(t.waitMs(0, 2)).toBe(0)
    t.sent(0, 1000)
    expect(t.waitMs(0, 2)).toBe(1000)
    expect(t.waitMs(400, 2)).toBe(600)
    expect(t.waitMs(1000, 2)).toBe(0)
  })

  it('forgets what was sent when the person speaks over it', () => {
    const t = new PlaybackTimeline()
    t.sent(0, 1000)
    t.sent(0, 1000)
    t.clear()
    expect(t.unheard(0)).toBe(0)
    expect(t.speakingUntil()).toBe(0)
  })

  it('reads 24 kHz PCM16 as 48 bytes a millisecond', () => {
    expect(audioMs(48_000)).toBe(1000)
  })
})
