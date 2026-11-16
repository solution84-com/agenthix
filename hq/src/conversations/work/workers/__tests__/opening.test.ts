import { describe, expect, it } from 'vitest'
import { isBriefInput } from '../opening'

describe("a brief's run is known by its input @SC-960", () => {
  it('as the brief alone, or with the opening a run started before carried', () => {
    expect(isBriefInput('Profile it', 'Profile it')).toBe(true)
    expect(isBriefInput('You are Kernel.\n\nProfile it', 'Profile it')).toBe(true)
    expect(isBriefInput('You are Kernel.\n\nSomething else', 'Profile it')).toBe(false)
  })
})
