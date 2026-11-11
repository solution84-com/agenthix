import { describe, expect, it } from 'vitest'
import { advance, atRest, carriesOn, opacityAt, passedTo, relayOut, settle, startReveal, type Aim } from '../revealState'
import { REVEAL } from '../pace'

const typed: Aim = { target: null, live: false, reduced: false }
const frames = (s: ReturnType<typeof startReveal>, aim: Aim, from: number, to: number) => { for (let t = from; t <= to; t += 16) advance(s, aim, t) }

describe('a reply revealed as one position @SC-1913 @SC-1914', () => {
  it('shows a message loaded whole at once', () => {
    const s = startReveal('From history.', false)
    expect(opacityAt(s, 0, 0, false)).toBe(1)
    expect(atRest(s, typed, 0)).toBe(true)
  })

  it('records when each character is passed, in order, and fades it in from then', () => {
    const s = startReveal('Hello there', true)
    frames(s, typed, 0, 400)
    const passed = passedTo(s)
    expect(passed).toBeGreaterThan(0)
    expect(s.passed).toEqual([...s.passed].sort((a, b) => a - b))
    const at = s.passed[0]!
    expect(opacityAt(s, 0, at, false)).toBe(0)
    expect(opacityAt(s, 0, at + REVEAL.fadeMs, false)).toBe(1)
    // Not passed yet: hidden.
    expect(opacityAt(s, passed, 400, false)).toBe(0)
  })

  it('lets the last letters finish fading on their own when it holds', () => {
    const s = startReveal('Hi.', true)
    frames(s, typed, 0, 2000)
    expect(passedTo(s)).toBe(3)
    expect(atRest(s, typed, 2000)).toBe(true)
    expect(settle(s, 2000)).toBe(3)
  })

  it('in voice, goes only as far as the target', () => {
    const s = startReveal('One two three.', true)
    frames(s, { target: 7, live: false, reduced: false }, 0, 2000)
    expect(passedTo(s)).toBe(7)
    expect(s.x).toBeLessThanOrEqual(7)
  })

  it('waits for a word still arriving in a stream', () => {
    const s = startReveal('Hello wor', true)
    frames(s, { target: null, live: true, reduced: false }, 0, 3000)
    expect(passedTo(s)).toBe(6)
  })

  it('under reduced motion, shows up to the target at once with no fade @SC-1915', () => {
    const s = startReveal('One two three.', true)
    advance(s, { target: 7, live: false, reduced: true }, 100)
    expect(passedTo(s)).toBe(7)
    expect(opacityAt(s, 3, 100, true)).toBe(1)
    expect(opacityAt(s, 8, 100, true)).toBe(0)
  })

  it('drops at once to what is left when the text is cut, and only new text reveals after', () => {
    const s = startReveal('One two three.', true)
    frames(s, { target: 14, live: false, reduced: false }, 0, 3000)
    relayOut(s, 'One two')
    expect(s.x).toBe(7)
    expect(passedTo(s)).toBe(7)
    relayOut(s, 'One two, four.')
    expect(opacityAt(s, 3, 3000, false)).toBe(1)
    expect(opacityAt(s, 9, 3000, false)).toBe(0)
  })

  it('carries on over its text continued or cut short, not over other text', () => {
    const s = startReveal('Hello there', true)
    frames(s, typed, 0, 200)
    expect(carriesOn(s, 'Hello there, friend')).toBe(true)
    expect(carriesOn(s, 'Hello')).toBe(true)
    expect(carriesOn(s, 'Goodbye')).toBe(false)
  })
})
