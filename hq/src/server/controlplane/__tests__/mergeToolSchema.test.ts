import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { MERGE_TOOL_DECLARATION, MERGE_TOOL_SUMMARY_MAX, UPDATE_TOOL_DECLARATION } from '@agenthix/core'
import { ALL_CONTROL_PLANE_TOOLS, MERGE_TOOL_SCHEMA, UPDATE_TOOL_SCHEMA } from '../toolSchemas'
import { operations } from '../operations'
import { ADMINISTRATIVE_MCP_TOOLS, ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, SYSTEM_MCP_TOOLS } from '../../../shared/mcpTools'

describe("the agent's merge_into_main tool @SC-1681", () => {
  const parse = (args: unknown) => z.object(MERGE_TOOL_SCHEMA.schema).safeParse(args)

  it("is core's declaration, on the data path, with an operation behind it", () => {
    expect(SYSTEM_MCP_TOOLS.CODE.MERGE_INTO_MAIN).toBe('merge_into_main')
    expect(MERGE_TOOL_SCHEMA.description).toBe(MERGE_TOOL_DECLARATION.description)
    expect(ALL_CONTROL_PLANE_TOOLS.filter(t => t.name === 'merge_into_main')).toHaveLength(1)
    expect(typeof operations.merge_into_main).toBe('function')
    expect(typeof operations.commit).toBe('function')
  })

  it('is in no access tier: only a run on a branch is answered', () => {
    for (const tier of [ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, ADMINISTRATIVE_MCP_TOOLS]) expect(tier).not.toContain('merge_into_main')
  })

  it('takes only a summary, optional, and strips anything else the caller sent', () => {
    expect(parse({}).success).toBe(true)
    const parsed = parse({ summary: ' Login page ', branch: 'main', expectedMain: 'x', personId: 'someone' })
    expect(parsed.success && parsed.data).toEqual({ summary: 'Login page' })
    expect(parse({ summary: 'x'.repeat(MERGE_TOOL_SUMMARY_MAX + 1) }).success).toBe(false)
  })

  it('says to ask at once when the person asked, directly or through a brief, and never otherwise', () => {
    expect(MERGE_TOOL_DECLARATION.description).toMatch(/Call it as soon as they ask/)
    expect(MERGE_TOOL_DECLARATION.description).toMatch(/passed on to you in a brief/)
    expect(MERGE_TOOL_DECLARATION.description).toMatch(/Never call it because the work looks finished and nobody asked/)
  })
})

describe("the agent's update_from_main tool @SC-1672", () => {
  it("is core's declaration, on the data path, in no access tier, taking nothing but the run", () => {
    expect(SYSTEM_MCP_TOOLS.CODE.UPDATE_FROM_MAIN).toBe('update_from_main')
    expect(UPDATE_TOOL_SCHEMA.description).toBe(UPDATE_TOOL_DECLARATION.description)
    expect(ALL_CONTROL_PLANE_TOOLS.filter(t => t.name === 'update_from_main')).toHaveLength(1)
    expect(typeof operations.update_from_main).toBe('function')
    for (const tier of [ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, ADMINISTRATIVE_MCP_TOOLS]) expect(tier).not.toContain('update_from_main')
    const parsed = z.object(UPDATE_TOOL_SCHEMA.schema).safeParse({ branch: 'main', runId: 'r1' })
    expect(parsed.success && parsed.data).toEqual({ runId: 'r1' })
  })
})
