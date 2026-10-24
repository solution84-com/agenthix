import { describe, expect, it } from 'vitest'
import { WORKFLOW_TOOL_DECLARATIONS, WORKFLOW_TOOL_NAMES, type WorkflowToolArgs, type WorkflowToolName } from '../agentTools.js'

// Every tool has its arguments' type, and no other name does.
const argsForEveryTool: [Exclude<WorkflowToolName, keyof WorkflowToolArgs>] extends [never] ? true : never = true
const noOtherArgs: [Exclude<keyof WorkflowToolArgs, WorkflowToolName>] extends [never] ? true : never = true
void [argsForEveryTool, noOtherArgs]

describe('the agent\'s workflow tools', () => {
  it('declares the four tools once each', () => {
    expect(WORKFLOW_TOOL_DECLARATIONS.map(t => t.name).sort()).toEqual(Object.values(WORKFLOW_TOOL_NAMES).sort())
  })

  it('acts for the calling run only: the site fills in its run, the agent cannot name one', () => {
    for (const t of WORKFLOW_TOOL_DECLARATIONS) {
      expect(t.runIdFromCaller, t.name).toBe(true)
      expect(Object.keys(t.args), t.name).not.toContain('runId')
    }
  })

  it('declares the arguments its types name', () => {
    const args = Object.fromEntries(WORKFLOW_TOOL_DECLARATIONS.map(t => [t.name, Object.keys(t.args).sort()]))
    expect(args).toEqual({
      list_workflows: [],
      propose_workflow: ['path'],
      run_workflow: ['name', 'parameters'],
      workflow_run: ['id'],
    })
  })
})
