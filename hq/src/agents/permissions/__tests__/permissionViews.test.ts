import { describe, it, expect } from 'vitest'
import { organisationView, narrowingView } from '../permissionViews'
import { ALWAYS_INJECTED_MCP_TOOLS } from '../../../shared/mcpTools'
import type { AgentOverrideValues } from '../../overrides/agentOverrideService'

const org = {
  approval: 'deferred' as const,
  allowedTools: [
    { name: 'read_file', state: 'always' }, { name: 'bash', state: 'ask' }, { name: 'web_fetch', state: 'never' },
    { name: 'list_tasks', state: 'always' },
  ],
  allowedBashPatterns: [{ pattern: 'git', state: 'always' }],
}
const none: AgentOverrideValues = { model: null, approval: null, allowedTools: null, allowedBashPatterns: null }

describe("the organisation's permissions view @SC-617", () => {
  const view = organisationView(org)
  const state = (name: string) => view.tools.find(t => t.name === name)?.state

  it('lists every tool in its group, a built-in the list leaves out unavailable and a platform tool asked about', () => {
    expect(state('read_file')).toBe('always')
    expect(state('write_file')).toBe('never')
    expect(state('create_task')).toBe('ask')
    expect(view.tools.find(t => t.name === 'bash')?.group).toBe('commands')
    expect(view.tools.find(t => t.name === ALWAYS_INJECTED_MCP_TOOLS[0])).toMatchObject({ fixed: true, state: 'always' })
  })

  it('summarises each group, leaving the fixed tools out', () => {
    expect(view.summary.find(s => s.group === 'files')).toEqual({ group: 'files', always: 1, ask: 0, never: 4 })
    expect(view.summary.find(s => s.group === 'commands')).toEqual({ group: 'commands', always: 0, ask: 1, never: 0 })
    expect(view.summary.find(s => s.group === 'web')).toEqual({ group: 'web', always: 0, ask: 0, never: 2 })
  })

  it('carries approval and the bash patterns', () => {
    expect(view.approval).toBe('deferred')
    expect(view.bashPatterns).toEqual([{ pattern: 'git', state: 'always' }])
  })
})

describe("a project's or a person's view @SC-617", () => {
  it('shows the organisation\'s setting beside this level\'s, and counts only what is stricter', () => {
    const view = narrowingView(org, {
      ...none,
      approval: 'immediate',
      allowedTools: [{ name: 'read_file', state: 'never' }, { name: 'bash', state: 'always' }],
      allowedBashPatterns: [{ pattern: 'git push', state: 'never' }, { pattern: 'git', state: 'always' }],
    })
    expect(view.approval).toEqual({ organisation: 'deferred', here: 'immediate', effective: 'immediate', narrowed: true })
    expect(view.tools.find(t => t.name === 'read_file')).toMatchObject({ organisation: 'always', here: 'never', effective: 'never', narrowed: true })
    expect(view.tools.find(t => t.name === 'bash')).toMatchObject({ organisation: 'ask', here: 'always', effective: 'ask', narrowed: false })
    expect(view.bashPatterns).toEqual([
      { pattern: 'git', organisation: 'always', here: 'always', effective: 'always', narrowed: false },
      { pattern: 'git push', organisation: 'always', here: 'never', effective: 'never', narrowed: true },
    ])
    expect(view.narrowedCount).toBe(3)
  })

  it('narrows nothing without a narrowing', () => {
    const view = narrowingView(org, null)
    expect(view.narrowedCount).toBe(0)
    expect(view.approval).toEqual({ organisation: 'deferred', here: null, effective: 'deferred', narrowed: false })
  })

  it('starts every tool at Always when the organisation bypasses and this level sets an approval', () => {
    const view = narrowingView({ ...org, approval: 'bypassed' }, { ...none, approval: 'deferred', allowedTools: [{ name: 'bash', state: 'never' }] })
    expect(view.organisationBypassed).toBe(true)
    expect(view.tools.find(t => t.name === 'web_fetch')).toMatchObject({ organisation: 'always', effective: 'always' })
    expect(view.tools.find(t => t.name === 'bash')).toMatchObject({ organisation: 'always', effective: 'never', narrowed: true })
    expect(view.bashPatterns).toEqual([])
    expect(view.narrowedCount).toBe(2)
  })

  it('counts nothing below approval while the run stays bypassed', () => {
    const view = narrowingView({ ...org, approval: 'bypassed' }, { ...none, allowedTools: [{ name: 'bash', state: 'never' }] })
    expect(view.approval.effective).toBe('bypassed')
    expect(view.narrowedCount).toBe(0)
  })
})

describe("a pattern only a narrower level names, in a project's or a person's view @SC-612", () => {
  const withBash = (state: 'always' | 'ask' | 'never') => ({ ...org, allowedTools: [...org.allowedTools.filter(t => t.name !== 'bash'), { name: 'bash', state }] })
  const narrowing: AgentOverrideValues = { ...none, allowedBashPatterns: [{ pattern: 'rm', state: 'never' }] }
  const rm = (view: ReturnType<typeof narrowingView>) => view.bashPatterns.find(p => p.pattern === 'rm')

  it("shows the organisation's Any other command — the Bash tool's own state — as the organisation's setting", () => {
    expect(rm(narrowingView(withBash('always'), narrowing))).toMatchObject({ organisation: 'always', here: 'never', effective: 'never', narrowed: true })
    expect(rm(narrowingView(withBash('ask'), narrowing))).toMatchObject({ organisation: 'ask', narrowed: true })
    expect(rm(narrowingView(withBash('never'), narrowing))).toMatchObject({ organisation: 'never', effective: 'never', narrowed: false })
  })

  it('shows Always for it while the organisation bypasses', () => {
    expect(rm(narrowingView({ ...org, approval: 'bypassed' }, { ...narrowing, approval: 'deferred' }))).toMatchObject({ organisation: 'always' })
  })
})
