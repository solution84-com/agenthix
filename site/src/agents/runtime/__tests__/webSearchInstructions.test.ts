/**
 * What a run is told of web search when it has none (walkthrough finding W2): its agent's tools withhold it — Never,
 * or Ask in a run nobody can approve — before a missing key, and a run that can search is told nothing.
 */
import { describe, expect, it } from 'vitest'
import { NO_WEB_SEARCH_INSTRUCTIONS, webSearchWithheldInstructions } from '@agenthix/core'
import { webSearchInstructions, webSearchWithheldBy } from '../webSearchInstructions'
import type { ApprovedManifest, ToolPermissionState } from '@agenthix/core'

const MANIFEST = { tools: [], bashPatterns: [] } as unknown as ApprovedManifest
const run = (state: ToolPermissionState | null, over: { webSearchKey?: string; approvedManifest?: ApprovedManifest; bypassed?: boolean } = {}) => ({
  allowedTools: state ? [{ name: 'web_search', state }] : [{ name: 'read_file', state: 'always' as const }],
  approvedManifest: MANIFEST,
  webSearchKey: 'exa-key',
  ...over,
})

describe("web search withheld by the agent's tools (W2)", () => {
  it('is withheld at Never in every run, and at Ask only in a run nobody can approve', () => {
    expect(webSearchWithheldBy(run('never'))).toBe('never')
    expect(webSearchWithheldBy(run('never', { approvedManifest: undefined }))).toBe('never')
    expect(webSearchWithheldBy(run('ask'))).toBeNull()
    expect(webSearchWithheldBy(run('ask', { approvedManifest: undefined }))).toBe('unattended')
    expect(webSearchWithheldBy(run('always', { approvedManifest: undefined }))).toBeNull()
  })

  it('is never withheld from a bypassed run, or one with no tool list', () => {
    expect(webSearchWithheldBy(run('never', { bypassed: true }))).toBeNull()
    expect(webSearchWithheldBy({ approvedManifest: undefined, webSearchKey: undefined })).toBeNull()
  })

  it("tells the run its tools withhold it, on either runtime, and with or without a key — never the key's words", () => {
    for (const runtime of ['claude', 'opencode'] as const) {
      expect(webSearchInstructions(run('never'), runtime)).toBe(webSearchWithheldInstructions('never'))
      expect(webSearchInstructions(run('never', { webSearchKey: undefined }), runtime)).toBe(webSearchWithheldInstructions('never'))
      expect(webSearchInstructions(run('ask', { approvedManifest: undefined }), runtime)).toBe(webSearchWithheldInstructions('unattended'))
    }
  })

  it('tells an OpenCode run with no key why, and tells a run that can search nothing', () => {
    expect(webSearchInstructions(run('ask', { webSearchKey: undefined }), 'opencode')).toBe(NO_WEB_SEARCH_INSTRUCTIONS)
    expect(webSearchInstructions(run('ask', { webSearchKey: undefined }), 'claude')).toBeNull()
    expect(webSearchInstructions(run('ask'), 'opencode')).toBeNull()
    expect(webSearchInstructions(run('always'), 'claude')).toBeNull()
  })
})
