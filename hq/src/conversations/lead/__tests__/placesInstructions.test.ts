import { describe, expect, it } from 'vitest'
import { leadBaseInstructions, leadKnowledgeRules, leadMemoryRules } from '../instructions'

const text = leadBaseInstructions({ agentName: 'Kernel', agentRole: null, placeLabel: 'their own space' })

describe("the lead's instructions on places, projects and failures @SC-961", () => {
  it('make work for two places two pieces of work, one in each, never one done from the other', () => {
    expect(text).toMatch(/Work asked for in two places is two pieces of\s+work, one started in each/)
    expect(text).toMatch(/never do one place's work from another/)
    expect(text).toMatch(/words leave the place open, ask which before starting/)
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

  it("send a change to another conversation's or a task's branch to its own conversation", () => {
    expect(text).toMatch(/A branch that is another conversation's or a task's is changed only from its own\s+conversation/)
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
    const knowledge = leadKnowledgeRules()
    expect(knowledge).toMatch(/A question about Agenthix itself is searched in the guide \(scope platform\) before you answer it/)
    expect(knowledge).toMatch(/names its screens as the guide does/)
  })
})

describe("the lead's memory rules after ADR-0188", () => {
  const rules = leadMemoryRules()

  it('choose the kind: a standing instruction is a rule whose body says when it applies; anything else a fact', () => {
    expect(rules).toMatch(/standing instruction \("always", "whenever", "I prefer", "don't"\) is a rule/)
    expect(rules).toMatch(/body says when it applies as well as what to do/)
    expect(rules).toMatch(/anything else is a fact/)
  })

  it('send what is true of a place to its Knowledge, never to memory, and mark a requested memory', () => {
    expect(rules).toMatch(/What is true of a place, for everyone who works there, goes to that place's Knowledge, never to memory/)
    expect(rules).toMatch(/Set requested when they\s+asked you to remember it or corrected you/)
  })
})

describe("the lead's memory rules in the base instructions (lean agent context spec, §2)", () => {
  it('come near the top, right after how to talk', () => {
    const memory = text.indexOf('Memory:')
    expect(memory).toBeGreaterThan(text.indexOf('How you talk:'))
    expect(memory).toBeLessThan(text.indexOf('Tools and work:'))
  })

  it('tie saying "I\'ll remember" to the call, in the same reply', () => {
    expect(text).toMatch(/call remember in that same reply\. Saying you will remember it is not remembering it: only the call keeps it/)
  })
})
