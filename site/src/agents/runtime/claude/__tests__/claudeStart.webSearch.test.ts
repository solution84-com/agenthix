/** A Claude Code run whose agent's tools withhold web search is told why in its instructions (walkthrough finding W2). */
import { describe, expect, it, vi } from 'vitest'
import { webSearchWithheldInstructions, type ApprovedManifest } from '@agenthix/core'

vi.mock('../../../../server/siteConfig', () => ({ getAgentFacingSiteUrl: () => 'http://site:4201' }))

import { buildClaudeStart } from '../claudeStart'
import { claudeTestContext } from '../../__tests__/claudeTestContext'

const MANIFEST = { tools: [], bashPatterns: [] } as unknown as ApprovedManifest
// `attended: false` is a run with no manifest: nobody can approve an Ask in it.
const withSearch = (state: 'always' | 'ask' | 'never', attended = true) =>
  buildClaudeStart(claudeTestContext({ allowedTools: [{ name: 'web_search', state }], approvedManifest: attended ? MANIFEST : undefined }), null)

describe("a Claude Code run and its agent's web search permission @SC-2156", () => {
  it("at Never: WebSearch is not offered, and the instructions say the agent's tools don't allow it", () => {
    const start = withSearch('never')
    expect(start.options.tools).not.toContain('WebSearch')
    expect(start.options.systemPrompt).toBe(`You are a senior engineer.\n\n${webSearchWithheldInstructions('never')}`)
  })

  it("at Ask in a run nobody can approve: the instructions say the search needs a person's approval", () => {
    expect(withSearch('ask', false).options.systemPrompt).toBe(`You are a senior engineer.\n\n${webSearchWithheldInstructions('unattended')}`)
  })

  it('at Ask in a run a person can approve, and at Always: WebSearch is offered and nothing is added', () => {
    for (const state of ['ask', 'always'] as const) {
      const start = withSearch(state)
      expect(start.options.tools).toContain('WebSearch')
      expect(start.options.systemPrompt).toBe('You are a senior engineer.')
    }
  })

  it('a changed permission starts a new process, since the instructions are read when it starts', () => {
    expect(withSearch('never').fingerprint).not.toBe(withSearch('always').fingerprint)
  })
})
