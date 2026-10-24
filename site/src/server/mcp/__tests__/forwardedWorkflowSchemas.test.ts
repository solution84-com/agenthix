import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { WORKFLOW_TOOL_DECLARATIONS, WORKFLOW_TOOL_NAMES } from '@agenthix/core'
import { FORWARDED_TOOLS } from '../forwardedToolSchemas'

const workflowTools = FORWARDED_TOOLS.filter(t => WORKFLOW_TOOL_DECLARATIONS.some(d => d.name === t.name))

describe("the agent's workflow tools on the site's MCP server @SC-1357", () => {
  it('forwards exactly the four core declares, each for the calling run', () => {
    expect(workflowTools.map(t => t.name).sort()).toEqual(Object.values(WORKFLOW_TOOL_NAMES).sort())
    for (const t of workflowTools) expect(t.runIdFromCaller).toBe(true)
  })

  it('offers no tool that approves, declines or switches a workflow', () => {
    const names = FORWARDED_TOOLS.map(t => t.name)
    expect(names.filter(n => /approve|decline|switch|enable|disable/.test(n) && /workflow/.test(n))).toEqual([])
  })

  it('takes the arguments core declares, and nothing an agent could use to name another run', () => {
    const run = workflowTools.find(t => t.name === 'run_workflow')!
    const parsed = z.object(run.schema).parse({ name: 'push', parameters: { branch: 'main' }, extra: 1 })
    expect(parsed).toEqual({ name: 'push', parameters: { branch: 'main' } })
    expect(() => z.object(run.schema).parse({ name: 'x'.repeat(65) })).toThrow()
    expect(() => z.object(run.schema).parse({ name: 'push', parameters: { branch: 1 } })).toThrow()
  })
})
