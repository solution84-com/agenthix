import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { COMMIT_TOOL_DECLARATION, COMMIT_TOOL_MESSAGE_MAX } from '@agenthix/core'
import { ALL_CONTROL_PLANE_TOOLS, COMMIT_TOOL_SCHEMA } from '../toolSchemas'
import {
  ADMINISTRATIVE_MCP_TOOLS, ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, SYSTEM_MCP_TOOLS,
} from '../../../shared/mcpTools'

describe('the agent\'s commit tool', () => {
  const parse = (args: unknown) => z.object(COMMIT_TOOL_SCHEMA.schema).safeParse(args)

  it('is core\'s declaration, on the data path', () => {
    expect(SYSTEM_MCP_TOOLS.CODE.COMMIT).toBe('commit')
    expect(COMMIT_TOOL_SCHEMA.name).toBe(COMMIT_TOOL_DECLARATION.name)
    expect(COMMIT_TOOL_SCHEMA.description).toBe(COMMIT_TOOL_DECLARATION.description)
    expect(ALL_CONTROL_PLANE_TOOLS.filter(t => t.name === 'commit')).toHaveLength(1)
  })

  it('is in no access tier: only a run on a code workspace is given it', () => {
    for (const tier of [ALWAYS_INJECTED_MCP_TOOLS, DEFAULT_ON_MCP_TOOLS, ADMINISTRATIVE_MCP_TOOLS]) {
      expect(tier).not.toContain('commit')
    }
  })

  it('takes a message and nothing the agent could aim elsewhere', () => {
    const ok = parse({ message: 'Add the login form', branch: 'main', path: '../x' })
    expect(ok.success && ok.data).toEqual({ message: 'Add the login form' })
    expect(parse({}).success).toBe(false)
    expect(parse({ message: '   ' }).success).toBe(false)
    expect(parse({ message: 'x'.repeat(COMMIT_TOOL_MESSAGE_MAX + 1) }).success).toBe(false)
  })
})
