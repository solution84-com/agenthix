import { describe, expect, it } from 'vitest'
import { fadeOf, lastWordEnd, springStep, typedGoal } from '../motion'
import { REVEAL } from '../pace'

const run = (target: number, frames: number, from = { x: 0, v: 0 }) => {
  const xs: number[] = []
  let s = from
  for (let i = 0; i < frames; i++) { s = springStep(s, target, 1 / 60, REVEAL.omega); xs.push(s.x) }
  return { xs, last: s }
}

describe('the spring the reveal moves on @SC-1913 @SC-1914', () => {
  it('never passes its target', () => {
    expect(Math.max(...run(10, 120).xs)).toBeLessThanOrEqual(10)
  })

  it('settles on its target', () => {
    const { last } = run(10, 120)
    expect(last.x).toBeCloseTo(10, 3)
    expect(Math.abs(last.v)).toBeLessThan(0.01)
  })

  it('eases into a hold: slower and slower as it nears the target', () => {
    const { xs } = run(10, 60)
    // Past its fastest point and until it snaps the last invisible hundredth onto the target.
    const steps = xs.slice(10).map((x, i) => x - xs[9 + i]!).filter((_, i) => 10 - xs[10 + i]! > 0.01)
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeLessThanOrEqual(steps[i - 1]! + 1e-9)
  })

  it('picks up again smoothly when the target moves on', () => {
    const held = run(10, 120).last
    const first = springStep(held, 20, 1 / 60, REVEAL.omega)
    // From rest, the first step is small: it eases out rather than jumping.
    expect(first.x - held.x).toBeLessThan(1)
    expect(first.x).toBeGreaterThan(held.x)
  })
})

describe('the typed target @SC-1914', () => {
  it('is the end of what arrived once it is caught up', () => {
    expect(typedGoal(10, 12, 100)).toBe(12)
  })

  it('moves at the steady reading pace through a burst', () => {
    // 200 characters arrived at once: 16 ms on, it has moved 0.2 × 16 characters.
    expect(typedGoal(0, 200, 16)).toBeCloseTo(REVEAL.burstCharsPerMs * 16)
  })

  it('speeds up when further behind than the lag it allows', () => {
    // 2 400 characters behind: it clears them at 2 a millisecond, not 0.2.
    expect(typedGoal(0, 2400, 10)).toBeCloseTo((2400 / REVEAL.maxLagMs) * 10)
  })

  it('drops back to what may show when that is cut', () => {
    expect(typedGoal(50, 20, 16)).toBe(20)
  })
})

describe('a character fading in @SC-1913 @SC-1914', () => {
  it('starts hidden, eases out, and is whole after the fade', () => {
    expect(fadeOf(1000, 1000)).toBe(0)
    expect(fadeOf(1000, 1000 + REVEAL.fadeMs / 2)).toBeCloseTo(0.75)
    expect(fadeOf(1000, 1000 + REVEAL.fadeMs)).toBe(1)
  })
})

describe('the last whole word of a stream @SC-1914', () => {
  it('waits for a half-arrived word', () => {
    expect(lastWordEnd('Hello wor')).toBe(6)
    expect(lastWordEnd('Hello world ')).toBe(12)
    expect(lastWordEnd('Hel')).toBe(0)
  })
})
