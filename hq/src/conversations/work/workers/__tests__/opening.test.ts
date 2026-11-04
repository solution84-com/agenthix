import { describe, expect, it } from 'vitest'
import { briefOpening, isBriefInput, withOpening } from '../opening'

describe("a brief's opening @SC-960", () => {
  it('tells the background session it is the agent, working for the person who asked, in the place', () => {
    const text = briefOpening({ agentName: 'Kernel', personName: 'Avery', projectName: 'Walkthrough' })
    expect(text).toMatch(/^You are Kernel, working in the background on something Avery asked you for in your conversation/)
    expect(text).toContain('in the Walkthrough project')
    expect(text).toMatch(/What you finish with is what you will tell them/)
    expect(text).toMatch(/whole result, in your own voice/)
    expect(text).toContain('speak to them as "you", not by their name')
  })

  it("names the person's own space, and says 'the person' when they have no name yet", () => {
    expect(briefOpening({ agentName: 'Kernel', personName: 'Avery', projectName: null })).toContain("in Avery's own space")
    const nameless = briefOpening({ agentName: 'Kernel', personName: null, projectName: null })
    expect(nameless).toContain('something the person asked you for')
    expect(nameless).toContain('in their own space')
  })

  it('never splits the agent in two', () => {
    const text = briefOpening({ agentName: 'Kernel', personName: 'Avery', projectName: 'Shop' })
    expect(text).not.toMatch(/worker|helper|job|the run\b|passed|handed/i)
  })

  it('goes before the brief, and a run whose input carries the brief is known as that brief\'s', () => {
    const input = withOpening('Profile it', 'You are Kernel.')
    expect(input).toBe('You are Kernel.\n\nProfile it')
    expect(isBriefInput(input, 'Profile it')).toBe(true)
    expect(isBriefInput('Profile it', 'Profile it')).toBe(true)
    expect(isBriefInput('You are Kernel.\n\nSomething else', 'Profile it')).toBe(false)
  })
})
