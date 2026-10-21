import { describe, expect, it } from 'vitest'
import { leadBaseInstructions } from '../instructions'

const text = leadBaseInstructions({ agentName: 'Kernel', agentRole: null, placeLabel: 'their own space' })

describe("the lead's instructions on places, projects and failures @SC-961", () => {
  it('make work for two places two pieces of work, one in each, never one done from the other', () => {
    expect(text).toMatch(/Work asked for in two places is two pieces of\s+work, one started in each/)
    expect(text).toMatch(/never do one place's work from another/)
  })

  it('know a project by its key as well as its name', () => {
    expect(text).toMatch(/A project goes by its key .* and by its name/s)
    expect(text).toContain("list_projects gives each project's key, name and id")
  })

  it("say an unassigned project is not unknown, and how a project admin assigns the agent", () => {
    expect(text).toMatch(/you aren't assigned to is not unknown/)
    expect(text).toMatch(/a project admin can assign you in its Members/)
  })

  it('try again what failed earlier, rather than trusting the old failure', () => {
    expect(text).toMatch(/Something that failed earlier in this conversation may work now/)
    expect(text).toMatch(/try again; refuse only for what fails now/)
  })
})
