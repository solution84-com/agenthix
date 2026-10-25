import { describe, it, expect } from 'vitest'
import { WORKFLOW_TOOL_DECLARATIONS } from '@agenthix/core'
import { DEFAULT_TOOL_PERMISSIONS, mergeWithAlwaysInjected } from '../toolPermissions'
import { SYSTEM_MCP_TOOLS, ALWAYS_INJECTED_MCP_TOOLS } from '../../shared/mcpTools'
import { resolveEffectivePermissions } from '../permissions/effectivePermissions'

const names = WORKFLOW_TOOL_DECLARATIONS.map((d) => d.name)

describe('the workflow tools reach every agent without configuration @SC-1300', () => {
  it('are every tool core declares, always injected', () => {
    expect(Object.values(SYSTEM_MCP_TOOLS.WORKFLOW).sort()).toEqual([...names].sort())
    for (const name of names) expect(ALWAYS_INJECTED_MCP_TOOLS).toContain(name)
  })

  it('arrive for an agent that configured nothing, and a never cannot take them away', () => {
    const byDefault = new Map(DEFAULT_TOOL_PERMISSIONS.map((p) => [p.name, p.state]))
    const merged = new Map(mergeWithAlwaysInjected(names.map((name) => ({ name, state: 'never' as const }))).map((p) => [p.name, p.state]))
    for (const name of names) {
      expect(byDefault.get(name)).toBe('always')
      expect(merged.get(name)).toBe('always')
    }
  })

  it('are in a bypassed run\'s tools too', () => {
    const run = resolveEffectivePermissions({ approval: 'bypassed', allowedTools: null, allowedBashPatterns: null }, null)
    const tools = new Set(run.allowedTools.map((t) => t.name))
    for (const name of names) expect(tools.has(name)).toBe(true)
  })
})
