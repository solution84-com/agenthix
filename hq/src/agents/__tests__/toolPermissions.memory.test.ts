import { describe, it, expect } from 'vitest'
import { DEFAULT_TOOL_PERMISSIONS, mergeWithAlwaysInjected } from '../toolPermissions'
import { SYSTEM_MCP_TOOLS, ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, ADMINISTRATIVE_MCP_TOOLS } from '../../shared/mcpTools'

const { REMEMBER, FORGET, RECALL } = SYSTEM_MCP_TOOLS.MEMORY

describe('the memory tools reach every agent without configuration @SC-990', () => {
  it('are always injected, and in no other tier', () => {
    for (const name of [REMEMBER, FORGET, RECALL]) {
      expect(ALWAYS_INJECTED_MCP_TOOLS).toContain(name)
      expect(DEFAULT_ON_MCP_TOOLS).not.toContain(name)
      expect(ADMINISTRATIVE_MCP_TOOLS).not.toContain(name)
    }
  })

  it('arrive on by default for an agent that has configured nothing', () => {
    const byName = new Map(DEFAULT_TOOL_PERMISSIONS.map(p => [p.name, p.state]))
    expect(byName.get(REMEMBER)).toBe('always')
    expect(byName.get(FORGET)).toBe('always')
    expect(byName.get(RECALL)).toBe('always')
  })

  it('cannot be turned off by an agent config that says never', () => {
    const merged = mergeWithAlwaysInjected([{ name: REMEMBER, state: 'never' }, { name: FORGET, state: 'never' }])
    const byName = new Map(merged.map(p => [p.name, p.state]))
    expect(byName.get(REMEMBER)).toBe('always')
    expect(byName.get(FORGET)).toBe('always')
  })

  it('are remember, forget and recall: curating memory is the person\'s, on the memory screen', () => {
    expect(Object.values(SYSTEM_MCP_TOOLS.MEMORY)).toEqual(['remember', 'forget', 'recall'])
  })
})
