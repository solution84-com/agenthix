/**
 * mcpTools.ts unit tests
 *
 *  SC-311 — listKnownToolNames() composes the workspace tool-restriction catalogue
 *
 * Full-catalogue tier completeness (every SYSTEM_MCP_TOOLS entry sits in exactly one
 * access tier) is guaranteed elsewhere — see
 * src/agents/runtime/__tests__/toolPermissions.test.ts — not re-asserted here.
 */
import { describe, it, expect } from 'vitest'
import { listKnownToolNames, SYSTEM_MCP_TOOLS } from './mcpTools'
import { RUNTIME_TOOLS } from './runtimeTools'

describe('listKnownToolNames @SC-311', () => {
  it('is non-empty', () => {
    expect(listKnownToolNames().length).toBeGreaterThan(0)
  })

  it('is sorted', () => {
    const names = listKnownToolNames()
    const sorted = [...names].sort()
    expect(names).toEqual(sorted)
  })

  it('is deduplicated', () => {
    const names = listKnownToolNames()
    expect(new Set(names).size).toBe(names.length)
  })

  it('contains a known MCP tool', () => {
    expect(listKnownToolNames()).toContain(SYSTEM_MCP_TOOLS.TASK.CREATE_TASK)
  })

  it('contains a known runtime tool', () => {
    expect(listKnownToolNames()).toContain(RUNTIME_TOOLS.BASH.BASH)
  })
})
