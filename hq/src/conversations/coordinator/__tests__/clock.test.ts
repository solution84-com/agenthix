import { describe, it, expect } from 'vitest'
import { clockNote, withClock } from '../clock'

const at = new Date('2026-10-17T23:30:00Z')

describe('the time the model is told @SC-947', () => {
  it("is the person's own date and time, in their timezone", () => {
    expect(clockNote(at, 'Asia/Phnom_Penh')).toBe("[It is now Sunday 18 October 2026, 06:30 in the person's timezone (Asia/Phnom_Penh).]")
  })

  it('is UTC, said so, when the person has no timezone', () => {
    expect(clockNote(at, null)).toBe('[It is now Saturday 17 October 2026, 23:30 UTC; the person has no timezone set.]')
  })

  it("joins the turn's last input, or follows it when that message is cached or not the person's", () => {
    const note = '[now]'
    expect(withClock([{ role: 'user', content: 'hi' }], note)).toEqual([{ role: 'user', content: 'hi\n\n[now]' }])
    expect(withClock([{ role: 'user', content: 'hi' }], note, 0)).toEqual([{ role: 'user', content: 'hi' }, { role: 'user', content: note }])
    expect(withClock([{ role: 'assistant', content: 'hi' }], note)).toEqual([{ role: 'assistant', content: 'hi' }, { role: 'user', content: note }])
  })

  it("keeps the files the person shared on the input it joins, so the turn's pictures still find them", () => {
    const shared = [{ name: 'shot.png', kind: 'image' as const, messageId: 'm1' }]
    expect(withClock([{ role: 'user', content: 'look', shared }], '[now]')).toEqual([{ role: 'user', content: 'look\n\n[now]', shared }])
  })
})
