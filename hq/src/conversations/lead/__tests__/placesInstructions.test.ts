import { describe, expect, it } from 'vitest'
import { leadBaseInstructions, leadMemoryRules } from '../instructions'

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

  it("say a place not in the conversation is out of reach, not empty, and offered with suggest_place (P6) @SC-1443", () => {
    expect(text).toMatch(/A place not in this conversation .* is out of reach, not unknown and not empty:\s+offer it with suggest_place/s)
  })

  it("say an unassigned project is not unknown, and how a project admin assigns the agent @SC-1443", () => {
    expect(text).toMatch(/where you aren't assigned .* is not unknown/s)
    expect(text).toMatch(/a project admin can assign you in its Members/)
  })

  it("keep the person's words: Files, Knowledge and Your space (F8, F9) @SC-1443", () => {
    expect(text).toMatch(/Keep the person's words, in replies and in briefs: "files" are a place's Files, not its knowledge pages;/)
    expect(text).toMatch(/"knowledge" is its Knowledge; "my space" is Your space, never the conversation's project/)
  })

  it('try again what failed earlier, rather than trusting the old failure', () => {
    expect(text).toMatch(/Something that failed earlier in this conversation may work now/)
    expect(text).toMatch(/try again; refuse only for what fails now/)
  })
})

describe("the lead's memory and knowledge rules @SC-1443", () => {
  const rules = leadMemoryRules()

  it('make a correction to knowledge one change to the page: not remembered, and no work started (F6)', () => {
    // The exception sits inside the rule that says to remember corrections, so the two can't be read apart.
    expect(rules).toMatch(/Mark a correction as one\. Except when it is\s+about what a knowledge page says: then the page is where it is kept\. Change the page yourself, and do not\s+remember it as well or start work for it/)
  })

  it("send a question about the product to the guide first, naming its screens (F7)", () => {
    expect(rules).toMatch(/A question about Agenthix itself is searched in the guide \(scope platform\) before you answer it/)
    expect(rules).toMatch(/names its screens as the guide does/)
  })
})
