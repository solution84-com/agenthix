import { describe, it, expect } from 'vitest'
import type { BashPatternPermission, ToolPermission } from '@agenthix/core'
import {
  resolveEffectivePermissions, stricterApproval, stricterState, patternStateAt, NO_NARROWING,
} from '../effectivePermissions'
import { EVERY_TOOL } from '../toolCatalogue'
import { ALWAYS_INJECTED_MCP_TOOLS } from '../../../shared/mcpTools'

const tool = (name: string, state: ToolPermission['state']): ToolPermission => ({ name, state })
const pattern = (p: string, state: BashPatternPermission['state']): BashPatternPermission => ({ pattern: p, state })
const stateOf = (tools: ToolPermission[], name: string) => tools.find(t => t.name === name)?.state

/**
 * What the site's gate does with a command: Bash at Never refuses it, the first pattern that matches it decides, and
 * a command none matches follows "Any other command", Bash's own state (a Bash the list leaves out reads as ask).
 */
const gateState = (r: { allowedTools: ToolPermission[]; allowedBashPatterns: BashPatternPermission[] }, cmd: string) => {
  const bash = stateOf(r.allowedTools, 'bash') ?? 'ask'
  if (bash === 'never') return 'never'
  return r.allowedBashPatterns.find(p => p.pattern.trim() === '*' || cmd.startsWith(p.pattern.trim()))?.state ?? bash
}

const org = (over: Partial<{ approval: 'bypassed' | 'deferred' | 'immediate'; allowedTools: unknown; allowedBashPatterns: unknown }> = {}) => ({
  approval: 'deferred' as const,
  allowedTools: [tool('read_file', 'always'), tool('write_file', 'always'), tool('bash', 'always'), tool('web_fetch', 'ask'), tool('web_search', 'never')],
  allowedBashPatterns: [],
  ...over,
})

describe('strictness @SC-611', () => {
  it('orders tool states Always < Ask < Never', () => {
    expect(stricterState('always', 'ask')).toBe('ask')
    expect(stricterState('never', 'ask')).toBe('never')
    expect(stricterState('ask', 'always')).toBe('ask')
  })

  it('orders approval bypassed < deferred < immediate, and a missing narrowing keeps the organisation\'s', () => {
    expect(stricterApproval('bypassed', 'deferred')).toBe('deferred')
    expect(stricterApproval('immediate', 'bypassed')).toBe('immediate')
    expect(stricterApproval('deferred', null)).toBe('deferred')
  })
})

describe('the strictest level wins, for each tool and approval @SC-611', () => {
  it('a narrowing\'s Never refuses a tool the organisation allows', () => {
    const r = resolveEffectivePermissions(org(), { ...NO_NARROWING, allowedTools: [tool('write_file', 'never')] })
    expect(stateOf(r.allowedTools, 'write_file')).toBe('never')
    expect(stateOf(r.allowedTools, 'read_file')).toBe('always')
  })

  it('a narrowing\'s Always never loosens the organisation\'s Ask or Never', () => {
    const r = resolveEffectivePermissions(org(), { ...NO_NARROWING, allowedTools: [tool('web_fetch', 'always'), tool('web_search', 'always')] })
    expect(stateOf(r.allowedTools, 'web_fetch')).toBe('ask')
    expect(stateOf(r.allowedTools, 'web_search')).toBe('never')
  })

  it('a narrowing never grants a tool the organisation\'s list leaves out — only a Never for it is kept', () => {
    const r = resolveEffectivePermissions(org(), { ...NO_NARROWING, allowedTools: [tool('glob_files', 'always'), tool('grep_files', 'never')] })
    expect(stateOf(r.allowedTools, 'glob_files')).toBeUndefined()
    expect(stateOf(r.allowedTools, 'grep_files')).toBe('never')
  })

  it('a narrowing\'s Ask holds a tool the organisation allows always', () => {
    const r = resolveEffectivePermissions(org(), { ...NO_NARROWING, allowedTools: [tool('read_file', 'ask')] })
    expect(stateOf(r.allowedTools, 'read_file')).toBe('ask')
  })

  it('a narrowing\'s immediate wins over the organisation\'s deferred, and its bypassed over nothing', () => {
    expect(resolveEffectivePermissions(org(), { ...NO_NARROWING, approval: 'immediate' }).approval).toBe('immediate')
    expect(resolveEffectivePermissions(org({ approval: 'immediate' }), { ...NO_NARROWING, approval: 'bypassed' }).approval).toBe('immediate')
  })

  it('keeps the always-injected tools pinned at the organisation, as before', () => {
    const r = resolveEffectivePermissions(org({ allowedTools: [tool(ALWAYS_INJECTED_MCP_TOOLS[0], 'never')] }), null)
    expect(stateOf(r.allowedTools, ALWAYS_INJECTED_MCP_TOOLS[0])).toBe('always')
  })

  it('keeps the always-injected tools fixed below the organisation too', () => {
    const r = resolveEffectivePermissions(org(), { ...NO_NARROWING, allowedTools: [tool(ALWAYS_INJECTED_MCP_TOOLS[0], 'never')] })
    expect(stateOf(r.allowedTools, ALWAYS_INJECTED_MCP_TOOLS[0])).toBe('always')
  })

  it('with no narrowing, is the organisation\'s own', () => {
    const r = resolveEffectivePermissions(org({ allowedBashPatterns: [pattern('git', 'always')] }), null)
    expect(r.approval).toBe('deferred')
    expect(stateOf(r.allowedTools, 'web_fetch')).toBe('ask')
    expect(r.allowedBashPatterns).toEqual([pattern('git', 'always')])
  })
})

describe('when the organisation bypasses approval @SC-613', () => {
  it('stays bypassed when nothing narrower sets an approval, and no saved list applies: every tool is Always', () => {
    const r = resolveEffectivePermissions(org({ approval: 'bypassed' }), { ...NO_NARROWING, allowedTools: [tool('read_file', 'never')] })
    expect(r.approval).toBe('bypassed')
    expect(stateOf(r.allowedTools, 'read_file')).toBe('always')
    expect(stateOf(r.allowedTools, 'web_search')).toBe('always')
    for (const name of EVERY_TOOL.map(t => t.name)) expect(stateOf(r.allowedTools, name)).toBe('always')
  })

  it("switches off the organisation's Never for platform tools too, administrative ones included", () => {
    const r = resolveEffectivePermissions(org({
      approval: 'bypassed', allowedTools: [tool('create_agent', 'never'), tool('update_org', 'never'), tool('bash', 'never')],
    }), null)
    expect(stateOf(r.allowedTools, 'create_agent')).toBe('always')
    expect(stateOf(r.allowedTools, 'update_org')).toBe('always')
    expect(stateOf(r.allowedTools, 'bash')).toBe('always')
    expect(r.allowedTools.filter(t => t.state === 'never')).toEqual([])
  })

  it('switches off a saved list that omits tools: an omitted tool is Always too', () => {
    const r = resolveEffectivePermissions(org({ approval: 'bypassed', allowedTools: [tool('read_file', 'always')] }), null)
    expect(stateOf(r.allowedTools, 'write_file')).toBe('always')
    expect(stateOf(r.allowedTools, 'create_project')).toBe('always')
  })

  it('counts every tool as Always when a narrowing sets deferred or immediate, and applies the narrowing on top', () => {
    const r = resolveEffectivePermissions(org({ approval: 'bypassed' }), {
      ...NO_NARROWING, approval: 'immediate', allowedTools: [tool('bash', 'never'), tool('web_fetch', 'ask')],
    })
    expect(r.approval).toBe('immediate')
    // The organisation's saved list (web_search never) is not used while it bypasses.
    expect(stateOf(r.allowedTools, 'web_search')).toBe('always')
    expect(stateOf(r.allowedTools, 'bash')).toBe('never')
    expect(stateOf(r.allowedTools, 'web_fetch')).toBe('ask')
    for (const name of EVERY_TOOL.map(t => t.name)) expect(stateOf(r.allowedTools, name)).toBeDefined()
  })

  it('lets every command run unless a narrower pattern says otherwise', () => {
    const r = resolveEffectivePermissions(org({ approval: 'bypassed', allowedBashPatterns: [pattern('rm', 'never')] }), {
      ...NO_NARROWING, approval: 'deferred', allowedBashPatterns: [pattern('git push', 'ask')],
    })
    expect(gateState(r, 'ls -la')).toBe('always')
    expect(gateState(r, 'rm -rf x')).toBe('always')
    expect(gateState(r, 'git push origin')).toBe('ask')
  })
})

describe('bash patterns, the strictest level winning for each command @SC-612', () => {
  it('refuses a command a pattern blocks only at the narrower level', () => {
    const r = resolveEffectivePermissions(org({ allowedBashPatterns: [pattern('git', 'always')] }), {
      ...NO_NARROWING, allowedBashPatterns: [pattern('git push', 'never')],
    })
    expect(gateState(r, 'git push origin main')).toBe('never')
    expect(gateState(r, 'git status')).toBe('always')
  })

  it('never lets a narrower Always pattern loosen the organisation: a command its Ask Bash asks about still asks', () => {
    const r = resolveEffectivePermissions(org({ allowedTools: [tool('bash', 'ask')], allowedBashPatterns: [pattern('git', 'always')] }), {
      ...NO_NARROWING, allowedBashPatterns: [pattern('rm', 'always'), pattern('git', 'always')],
    })
    expect(gateState(r, 'rm -rf /')).toBe('ask')
    expect(gateState(r, 'git log')).toBe('always')
  })

  it('keeps the organisation\'s own order: its first matching pattern decides at its level', () => {
    const r = resolveEffectivePermissions(org({ allowedBashPatterns: [pattern('git', 'never'), pattern('git status', 'always')] }), {
      ...NO_NARROWING, allowedBashPatterns: [pattern('npm', 'ask')],
    })
    expect(gateState(r, 'git status')).toBe('never')
    expect(gateState(r, 'npm test')).toBe('ask')
  })

  it('takes a narrower catch-all into account for every command', () => {
    const r = resolveEffectivePermissions(org({ allowedBashPatterns: [pattern('git', 'always')] }), {
      ...NO_NARROWING, allowedBashPatterns: [pattern('*', 'never')],
    })
    expect(gateState(r, 'git log')).toBe('never')
    expect(gateState(r, 'ls')).toBe('never')
  })

  it('answers a pattern\'s state at one level the way the gate would', () => {
    expect(patternStateAt([pattern('git', 'always')], 'git push', 'ask')).toBe('always')
    expect(patternStateAt([pattern('git', 'always')], 'ls', 'ask')).toBe('ask')
    expect(patternStateAt([], 'ls', null)).toBeNull()
  })
})

describe('a command matching no pattern follows Any other command, the Bash tool\'s own state @SC-612', () => {
  it("runs it when the organisation's Bash is Always, asks when Ask, refuses when Never", () => {
    const at = (state: ToolPermission['state']) =>
      resolveEffectivePermissions(org({ allowedTools: [tool('bash', state)], allowedBashPatterns: [pattern('rm', 'never')] }), null)
    expect(gateState(at('always'), 'make build')).toBe('always')
    expect(gateState(at('ask'), 'make build')).toBe('ask')
    expect(gateState(at('never'), 'make build')).toBe('never')
    expect(gateState(at('always'), 'rm -rf x')).toBe('never')
  })

  it("gives a pattern only a narrower level names the organisation's Any other command", () => {
    const r = resolveEffectivePermissions(org(), { ...NO_NARROWING, allowedBashPatterns: [pattern('npm', 'ask'), pattern('make', 'always')] })
    expect(gateState(r, 'npm install')).toBe('ask')
    expect(gateState(r, 'make build')).toBe('always')
    expect(gateState(r, 'ls')).toBe('always')
  })

  it("a narrowing's Bash at Ask asks about any other command, and leaves the organisation's patterns deciding theirs", () => {
    const r = resolveEffectivePermissions(org({ allowedBashPatterns: [pattern('git', 'always')] }), {
      ...NO_NARROWING, allowedTools: [tool('bash', 'ask')],
    })
    expect(gateState(r, 'make build')).toBe('ask')
    expect(gateState(r, 'git status')).toBe('always')
  })

  it("a narrowing's Never pattern still refuses what the organisation's Any other command runs", () => {
    const r = resolveEffectivePermissions(org(), { ...NO_NARROWING, allowedBashPatterns: [pattern('rm', 'never')] })
    expect(gateState(r, 'rm -rf x')).toBe('never')
    expect(gateState(r, 'make')).toBe('always')
  })
})
