import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { PROPOSE_SKILL_TOOL } from '@agenthix/core'
import { FORWARDED_TOOLS } from '../forwardedToolSchemas'
import { ALWAYS_INJECTED_MCP_TOOLS } from '../../../shared/mcpTools'

describe('propose_skill on the site\'s MCP server (skills spec part 5) @SC-1600', () => {
  const tool = FORWARDED_TOOLS.find(t => t.name === PROPOSE_SKILL_TOOL)

  it('is forwarded once, for the calling run, and given to every run', () => {
    expect(FORWARDED_TOOLS.filter(t => t.name === PROPOSE_SKILL_TOOL)).toHaveLength(1)
    expect(tool?.runIdFromCaller).toBe(true)
    expect(ALWAYS_INJECTED_MCP_TOOLS).toContain(PROPOSE_SKILL_TOOL)
  })

  it('takes the arguments core declares, and drops anything that would name a person', () => {
    const args = { name: 'review', description: 'Review a change.', files: { 'SKILL.md': '---\nname: review\n---\n' }, why: 'Asked', aim: 'project' }
    expect(z.object(tool!.schema).parse({ ...args, forUserId: 'u2', person: 'u2' })).toEqual(args)
    expect(() => z.object(tool!.schema).parse({ ...args, files: { 'SKILL.md': 1 } })).toThrow()
    expect(() => z.object(tool!.schema).parse({ ...args, name: 'x'.repeat(65) })).toThrow()
  })
})
