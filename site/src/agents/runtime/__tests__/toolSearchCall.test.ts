/**
 * How the gate and the run's record read the tool search's calls (ADR-0193): a use_tool call is the call of the tool
 * it names, find_tools needs no permission, and both search tools are pinned at Always for a run.
 */
import { describe, it, expect } from 'vitest'
import { gateCallOf, innerCallOf, recordedToolCall, withToolSearchTools } from '../toolSearchCall'

describe('a use_tool call @SC-2181', () => {
  it('is the call of the tool it names, with the agent\'s reason as what a person reads', () => {
    expect(gateCallOf({ toolName: 'use_tool', input: { name: 'run_workflow', input: { name: 'deploy' }, reason: 'To deploy' }, toolUseId: 'c1' }))
      .toEqual({ toolName: 'run_workflow', input: { name: 'deploy' }, toolUseId: 'c1', target: 'To deploy' })
  })

  it('reads an input sent as JSON text, or none at all', () => {
    expect(innerCallOf({ name: 'list_agents', input: '{"a":1}' })).toEqual({ name: 'list_agents', input: { a: 1 } })
    expect(innerCallOf({ name: 'list_agents' })).toEqual({ name: 'list_agents', input: {} })
  })

  it('that names nothing, or one of the search\'s own tools, is left as itself and permission-free', () => {
    for (const input of [{}, { name: '' }, { name: 'use_tool', input: {} }, { name: 'find_tools' }, { name: 'x', input: 'not json' }, { name: 'x', input: [1] }]) {
      expect(innerCallOf(input)).toBeNull()
      expect(gateCallOf({ toolName: 'use_tool', input })).toEqual({ toolName: 'use_tool', input, permissionFree: true })
    }
  })

  it('is recorded and shown as the tool it names, in the harness\'s own naming', () => {
    expect(recordedToolCall('mcp__platform__use_tool', { name: 'create_routine', input: { cron: '0 9 * * 1-5' } }))
      .toEqual({ toolName: 'mcp__platform__create_routine', toolInput: { cron: '0 9 * * 1-5' } })
    expect(recordedToolCall('use_tool', { name: 'create_routine', input: {} })).toEqual({ toolName: 'create_routine', toolInput: {} })
    expect(recordedToolCall('mcp__platform__find_tools', { query: 'x' })).toEqual({ toolName: 'mcp__platform__find_tools', toolInput: { query: 'x' } })
    expect(recordedToolCall('Read', { file_path: 'a' })).toEqual({ toolName: 'Read', toolInput: { file_path: 'a' } })
  })
})

describe('find_tools', () => {
  it('needs no permission: it grants nothing', () => {
    expect(gateCallOf({ toolName: 'find_tools', input: { query: 'x' } })).toEqual({ toolName: 'find_tools', input: { query: 'x' }, permissionFree: true })
  })
})

describe('a run\'s permissions', () => {
  it('hold both search tools at Always, whatever hq minted', () => {
    expect(withToolSearchTools([{ name: 'use_tool', state: 'never' }, { name: 'bash', state: 'ask' }])).toEqual([
      { name: 'bash', state: 'ask' }, { name: 'find_tools', state: 'always' }, { name: 'use_tool', state: 'always' },
    ])
  })
})
