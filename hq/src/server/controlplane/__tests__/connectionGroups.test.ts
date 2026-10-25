/**
 * A person's connection reaches a control-plane tool only when the tool's
 * permission group is on (adr-0090, agents own schedule spec §10). Every tool
 * on hq's MCP surface is placed in a group; the data-path-only tools act for
 * an agent's run and are in none, so no connection reaches them.
 */
import { describe, it, expect } from 'vitest'


import { callOperation } from '../operations'
import { TOOL_GROUPS } from '../connectionGroups'
import { CONTROL_PLANE_TOOLS, WORKFORCE_TOOLS, DATA_PATH_ONLY_TOOLS, KNOWLEDGE_TOOLS } from '../toolSchemas'
import { ControlPlaneError } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { CONNECTION_GROUPS, type ConnectionGroup } from '../../../shared/connections'

async function refusal(p: Promise<unknown>): Promise<ControlPlaneError> {
  const err = await p.then(() => null, e => e)
  expect(err).toBeInstanceOf(ControlPlaneError)
  expect(err.code).toBe('forbidden')
  return err
}

describe('the table of groups', () => {
  it.each([...CONTROL_PLANE_TOOLS, ...WORKFORCE_TOOLS].map(t => t.name))('places %s in a group', (name) => {
    expect(CONNECTION_GROUPS).toContain(TOOL_GROUPS[name])
  })

  it.each(DATA_PATH_ONLY_TOOLS.map(t => t.name))('places %s, which acts for a run, in none', (name) => {
    expect(Object.prototype.hasOwnProperty.call(TOOL_GROUPS, name)).toBe(false)
  })

  it('puts the spec\'s examples where it says', () => {
    expect(TOOL_GROUPS.list_tasks).toBe('read')
    expect(TOOL_GROUPS.add_comment).toBe('change_tasks')
    expect(TOOL_GROUPS.create_task).toBe('change_tasks')
    expect(TOOL_GROUPS.run_task).toBe('start_work')
    expect(TOOL_GROUPS.set_task_schedule).toBe('start_work')
    expect(TOOL_GROUPS.create_board).toBe('manage')
    expect(TOOL_GROUPS.propose_workforce_template).toBe('manage')
  })
})

describe('a call to a tool whose group is off', () => {
  const cases: [string, ConnectionGroup, RegExp][] = [
    ['list_tasks', 'read', /"Read"/],
    ['create_task', 'change_tasks', /"Change tasks"/],
    ['run_task', 'start_work', /"Start work"/],
    ['set_task_schedule', 'start_work', /"Start work"/],
    ['create_board', 'manage', /"Manage"/],
  ]

  it.each(cases)('%s is refused, naming the %s group, before the operation runs', async (tool, group, label) => {
    const others = new Set(CONNECTION_GROUPS.filter(g => g !== group))
    const err = await refusal(callOperation(tool, connectionCaller({ groups: others }), {}))
    expect(err.message).toMatch(label)
    expect(err.message).toContain(tool)
  })

  it('the default connection — Read only — is refused every change', async () => {
    const readOnly = connectionCaller({ groups: new Set<ConnectionGroup>(['read']) })
    for (const tool of ['update_task', 'add_comment', 'delete_task', 'run_task', 'create_project']) {
      await refusal(callOperation(tool, readOnly, {}))
    }
  })

  it.each([...DATA_PATH_ONLY_TOOLS, ...KNOWLEDGE_TOOLS].map(t => t.name))('%s is refused to a connection with every group on', async (tool) => {
    const err = await refusal(callOperation(tool, connectionCaller(), {}))
    expect(err.message).toMatch(/not available through a connection/)
  })
})
