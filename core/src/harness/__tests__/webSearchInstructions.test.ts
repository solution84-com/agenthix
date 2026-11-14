/** What a run and a reply are told when web search is withheld: by a missing key, or by the agent's own tools (W2). */
import { describe, expect, it } from 'vitest'
import {
  NO_WEB_SEARCH_INSTRUCTIONS, NO_WEB_SEARCH_WORDS, WEB_SEARCH_NEEDS_APPROVAL_WORDS, WEB_SEARCH_NOT_ALLOWED_WORDS,
  webSearchWithheldInstructions,
} from '../webSearchInstructions.js'

describe("web search withheld by the agent's tools @SC-2157", () => {
  it('says the tools do not allow it, where an admin allows it, and offers what it knows; never blames a key', () => {
    expect(WEB_SEARCH_NOT_ALLOWED_WORDS).toContain("My tools don't allow me to search the web here")
    for (const words of [WEB_SEARCH_NOT_ALLOWED_WORDS, WEB_SEARCH_NEEDS_APPROVAL_WORDS]) {
      expect(words).toContain('Manage agents ›')
      expect(words).toContain('Permissions')
      expect(words).toContain('Search the web is under Web')
      expect(words).toContain('I can answer from what I already know')
      expect(words).not.toMatch(/\bkey\b/i)
    }
  })

  it("in a run nobody can approve, says the search needs a person's approval", () => {
    expect(WEB_SEARCH_NEEDS_APPROVAL_WORDS).toContain("needs a person's approval")
    expect(WEB_SEARCH_NEEDS_APPROVAL_WORDS).toContain('nobody can approve it during this run')
  })

  it("tells the run why, in the words for each reason, and that it isn't about a key", () => {
    const never = webSearchWithheldInstructions('never')
    expect(never.split('\n')[0]).toBe('## Web search')
    expect(never).toContain(`"${WEB_SEARCH_NOT_ALLOWED_WORDS}"`)
    expect(never).toContain('never say a key is missing')
    expect(never).toContain("don't fetch pages to look it up")
    expect(never).not.toContain(NO_WEB_SEARCH_WORDS)
    const unattended = webSearchWithheldInstructions('unattended')
    expect(unattended).toContain(`"${WEB_SEARCH_NEEDS_APPROVAL_WORDS}"`)
    expect(unattended).toContain('nobody can approve it during this run')
  })

  it('leaves the no-key instructions as they were', () => {
    expect(NO_WEB_SEARCH_INSTRUCTIONS).toContain(`"${NO_WEB_SEARCH_WORDS}"`)
  })
})
