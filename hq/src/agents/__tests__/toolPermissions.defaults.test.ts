/**
 * What an agent that saved no tool list may do (walkthrough finding W2): the web tools at Ask, so a person approves
 * each fetch and search, bash at Never. A saved list keeps its own states; the defaults are read at run time.
 */
import { describe, expect, it } from 'vitest'
import { DEFAULT_TOOL_PERMISSIONS, coerceToolPermissions } from '../toolPermissions'
import { resolveEffectivePermissions } from '../permissions/effectivePermissions'

const stateOf = (list: { name: string; state: string }[], name: string) => list.find(p => p.name === name)?.state

describe('the default tool permissions', () => {
  it('put web_fetch and web_search at Ask, and bash at Never', () => {
    expect(stateOf(DEFAULT_TOOL_PERMISSIONS, 'web_fetch')).toBe('ask')
    expect(stateOf(DEFAULT_TOOL_PERMISSIONS, 'web_search')).toBe('ask')
    expect(stateOf(DEFAULT_TOOL_PERMISSIONS, 'bash')).toBe('never')
  })

  it('reach a run of an agent with no saved list; a saved Never is kept', () => {
    const none = resolveEffectivePermissions({ approval: 'deferred', allowedTools: null, allowedBashPatterns: null }, null)
    expect(stateOf(none.allowedTools, 'web_search')).toBe('ask')
    const saved = [{ name: 'web_search', state: 'never' as const }, { name: 'web_fetch', state: 'always' as const }]
    expect(coerceToolPermissions(saved)).toEqual(saved)
    const kept = resolveEffectivePermissions({ approval: 'deferred', allowedTools: saved, allowedBashPatterns: null }, null)
    expect(stateOf(kept.allowedTools, 'web_search')).toBe('never')
    expect(stateOf(kept.allowedTools, 'web_fetch')).toBe('always')
  })
})
