import { describe, it, expect } from 'vitest'
import {
  SYSTEM_MCP_TOOLS,
  ALWAYS_INJECTED_MCP_TOOLS,
  DEFAULT_ON_MCP_TOOLS,
  ADMINISTRATIVE_MCP_TOOLS,
} from '../../../shared/mcpTools'
import { runHasWriteTools } from '../toolPermissions'

describe('org-escaping tools are not granted by default @SC-305', () => {
  it('create_product and update_product are administrative, not default-on', () => {
    expect(DEFAULT_ON_MCP_TOOLS).not.toContain('create_product')
    expect(DEFAULT_ON_MCP_TOOLS).not.toContain('update_product')
    expect(ADMINISTRATIVE_MCP_TOOLS).toEqual(expect.arrayContaining(['create_product', 'update_product']))
  })
})

describe('every registered MCP tool sits in exactly one access tier', () => {
  it('has no gaps and no duplicates across ALWAYS_INJECTED / DEFAULT_ON / ADMINISTRATIVE', () => {
    const allRegisteredTools = Object.values(SYSTEM_MCP_TOOLS).flatMap(group => Object.values(group))
    const tiers = [ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, ADMINISTRATIVE_MCP_TOOLS]

    for (const toolName of allRegisteredTools) {
      const tierCount = tiers.filter(tier => tier.includes(toolName)).length
      expect(tierCount, `${toolName} should appear in exactly one tier, found in ${tierCount}`).toBe(1)
    }

    // Every tier entry should also correspond to a real registered tool (no stray/duplicated names).
    const allTiered = tiers.flat()
    expect(allTiered.length, 'a tool name is duplicated within or across tiers').toBe(new Set(allTiered).size)
    for (const tiered of allTiered) {
      expect(allRegisteredTools, `${tiered} appears in a tier but not in SYSTEM_MCP_TOOLS`).toContain(tiered)
    }
  })
})

describe('runHasWriteTools @SC-334 @SC-335', () => {
  it('bypassed with no denials → true', () => {
    expect(runHasWriteTools({ bypassed: true, allowedTools: null, neverTools: [] })).toBe(true)
  })

  it('bypassed but a workspace cap denies all write tools → false', () => {
    expect(runHasWriteTools({
      bypassed: true, allowedTools: null,
      neverTools: ['write_file', 'edit_file', 'bash'],
    })).toBe(false)
  })

  it('bypassed with only SOME write tools denied → true', () => {
    expect(runHasWriteTools({ bypassed: true, allowedTools: null, neverTools: ['bash'] })).toBe(true)
  })

  it('restricted with write_file: always → true', () => {
    expect(runHasWriteTools({
      bypassed: false,
      allowedTools: [{ name: 'write_file', state: 'always' }],
      neverTools: [],
    })).toBe(true)
  })

  it('restricted with edit_file ALONE granted → true (pins edit_file in WRITE_TOOLS)', () => {
    expect(runHasWriteTools({
      bypassed: false,
      allowedTools: [{ name: 'edit_file', state: 'always' }],
      neverTools: [],
    })).toBe(true)
  })

  it('restricted with write_file: ask → true (HITL can approve it)', () => {
    expect(runHasWriteTools({
      bypassed: false,
      allowedTools: [{ name: 'write_file', state: 'ask' }],
      neverTools: [],
    })).toBe(true)
  })

  it('restricted with only read tools → false', () => {
    expect(runHasWriteTools({
      bypassed: false,
      allowedTools: [{ name: 'read_file', state: 'always' }, { name: 'glob_files', state: 'always' }],
      neverTools: [],
    })).toBe(false)
  })

  it('restricted where allowed write tools are ALSO in neverTools → false (hard deny wins)', () => {
    expect(runHasWriteTools({
      bypassed: false,
      allowedTools: [{ name: 'write_file', state: 'always' }, { name: 'bash', state: 'always' }],
      neverTools: ['write_file', 'bash'],
    })).toBe(false)
  })
})
