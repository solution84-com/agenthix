/**
 * What a conversation's turn may call at the one tool entry (adr-0082): only the quick tools, only those its
 * agent may use in its place without asking, only reading for a turn that answers no one, and nothing once its
 * capability has expired. Each refusal is pinned here; the person behind the turn is pinned in
 * turnAuthority.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { callOperation } from '../operations'
import { ControlPlaneError } from '../types'
import { allowOnce, isTurnTool, turnToolAsks, turnToolRefusal, turnToolState } from '../turnCaller'
import { turnCapability, turnCaller } from './turnFixtures'

const always = (...names: string[]) => names.map(name => ({ name, state: 'always' as const }))

describe('the tools a turn may ever call @SC-950', () => {
  it.each(['run_task', 'set_task_schedule', 'create_routine', 'update_routine'])('%s starts work, so a turn never calls it', (tool) => {
    expect(isTurnTool(tool)).toBe(false)
  })

  it.each(['remember', 'forget', 'recall', 'start_preview'])('%s is the data path\'s, for a run in its container', (tool) => {
    expect(isTurnTool(tool)).toBe(false)
  })

  it('a deprecated tool and a name no tool has are not callable', () => {
    expect(isTurnTool('tick_subtask')).toBe(false)
    expect(isTurnTool('constructor')).toBe(false)
    expect(isTurnTool('no_such_tool')).toBe(false)
  })

  it.each(['list_tasks', 'get_task_details', 'create_task', 'update_task', 'add_comment', 'list_active_runs'])('%s is a quick tool a turn may call', (tool) => {
    expect(isTurnTool(tool)).toBe(true)
  })
})

describe("the agent's permissions in the place, read as a run's site reads them @SC-950", () => {
  it('a tool the list leaves out is Ask', () => {
    expect(turnToolState({ bypassed: false, allowedTools: [], allowedBashPatterns: [], neverTools: [] }, 'list_tasks')).toBe('ask')
  })

  it('Never binds even a bypassed turn', () => {
    expect(turnToolState({ bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: ['delete_task'] }, 'delete_task')).toBe('never')
    expect(turnToolState({ bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: ['delete_task'] }, 'list_tasks')).toBe('always')
  })
})

describe('a turn is refused @SC-950', () => {
  it('a tool set to Never for the agent', () => {
    const turn = turnCapability({ permissions: { bypassed: false, allowedTools: [{ name: 'delete_task', state: 'never' }], allowedBashPatterns: [], neverTools: ['delete_task'] } })
    expect(turnToolRefusal(turn, 'delete_task')).toMatch(/not available for this agent/)
  })

  it('a tool set to Ask, called directly: only a call a person approved runs', () => {
    const turn = turnCapability({ permissions: { bypassed: false, allowedTools: [{ name: 'delete_task', state: 'ask' }], allowedBashPatterns: [], neverTools: [] } })
    expect(turnToolRefusal(turn, 'delete_task')).toMatch(/approval/)
    expect(turnToolRefusal(allowOnce(turn, 'delete_task'), 'delete_task')).toBeNull()
  })

  it('every tool once its capability has expired', () => {
    const turn = turnCapability({ expiresAt: 1_000 })
    expect(turnToolRefusal(turn, 'list_tasks', 1_000)).toMatch(/expired/)
    expect(turnToolRefusal(turn, 'list_tasks', 999)).toBeNull()
  })

  it('any tool that changes something, when it answers no one', () => {
    const turn = turnCapability({ actingUserId: null, readerUserId: 'u1', permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] } })
    expect(turnToolRefusal(turn, 'create_task')).toMatch(/may only read/)
    expect(turnToolRefusal(turn, 'add_comment')).toMatch(/may only read/)
    expect(turnToolRefusal(turn, 'list_tasks')).toBeNull()
  })
})

describe('the tool entry holds a turn to its gate before any operation runs @SC-950', () => {
  async function refusalOf(name: string, ctx = turnCaller()): Promise<ControlPlaneError> {
    const err = await callOperation(name, ctx, {}).then(() => null, (e: unknown) => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect((err as ControlPlaneError).code).toBe('forbidden')
    return err as ControlPlaneError
  }

  it.each(['run_task', 'set_task_schedule', 'create_routine', 'remember', 'start_preview'])('refuses %s, even to a bypassed agent', async (tool) => {
    const ctx = turnCaller({ permissions: { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: [] } })
    expect((await refusalOf(tool, ctx)).message).toMatch(/not available in a conversation/)
  })

  it('refuses a tool its agent may not use', async () => {
    await refusalOf('delete_task', turnCaller({ permissions: { bypassed: false, allowedTools: always('list_tasks'), allowedBashPatterns: [], neverTools: [] } }))
  })

  it('refuses a call made with an expired capability', async () => {
    expect((await refusalOf('list_tasks', turnCaller({ expiresAt: Date.now() - 1 }))).message).toMatch(/expired/)
  })

  it('refuses a change from a turn that answers no one', async () => {
    await refusalOf('create_task', turnCaller({ actingUserId: null, readerUserId: 'u1' }))
  })
})

describe('a tool the turn may use only by asking @SC-950', () => {
  const asks = (allowedTools: { name: string; state: 'always' | 'ask' | 'never' }[], overrides = {}) =>
    turnCapability({ permissions: { bypassed: false, allowedTools, allowedBashPatterns: [], neverTools: allowedTools.filter(t => t.state === 'never').map(t => t.name) }, ...overrides })

  it('is one at Ask that the turn could otherwise call', () => {
    expect(turnToolAsks(asks([{ name: 'delete_task', state: 'ask' }]), 'delete_task')).toBe(true)
    expect(turnToolAsks(asks([]), 'list_tasks')).toBe(true)
  })

  it('is not one at Always or Never, one that starts work, or a change for a turn that acts for no one', () => {
    expect(turnToolAsks(asks([{ name: 'delete_task', state: 'always' }]), 'delete_task')).toBe(false)
    expect(turnToolAsks(asks([{ name: 'delete_task', state: 'never' }]), 'delete_task')).toBe(false)
    expect(turnToolAsks(asks([]), 'run_task')).toBe(false)
    expect(turnToolAsks(asks([], { actingUserId: null, readerUserId: 'u1' }), 'delete_task')).toBe(false)
  })

  it('lets through the one approved tool and no other', () => {
    const turn = allowOnce(asks([{ name: 'delete_task', state: 'ask' }, { name: 'update_task', state: 'ask' }]), 'delete_task')
    expect(turnToolState(turn.permissions, 'delete_task')).toBe('always')
    expect(turnToolState(turn.permissions, 'update_task')).toBe('ask')
  })

  it('never lets through a tool at Never', () => {
    const turn = allowOnce(asks([{ name: 'delete_task', state: 'never' }]), 'delete_task')
    expect(turnToolRefusal(turn, 'delete_task')).toMatch(/not available/)
  })
})
