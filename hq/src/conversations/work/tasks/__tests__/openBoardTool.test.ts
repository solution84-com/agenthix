/**
 * open_board (spec B6): the lead shows the person a board as a card that opens it, reading it through get_board under
 * the same rules, and changes nothing. Only a turn that answers a person may, with get_board allowed for its agent.
 */
import { describe, it, expect, vi } from 'vitest'
import { ControlPlaneError } from '../../../../server/controlplane/types'
import { turnCapability } from '../../../../server/controlplane/__tests__/turnFixtures'
import { createOpenBoardTool, type OpenBoardDeps } from '../openBoardTool'

const signal = new AbortController().signal

function tool(read: OpenBoardDeps['read'] = async () => ({
  board: { boardId: null, name: 'Task state', kind: 'STATE', builtIn: true },
  columns: [{ name: 'Backlog', count: 2 }, { name: 'To do', count: 1 }],
})) {
  const card = vi.fn(async () => {})
  return { card, tool: createOpenBoardTool({ read, card }) }
}

describe('open_board @SC-556', () => {
  it('leaves a card that opens a built-in board by its key, and answers its columns', async () => {
    const { tool: t, card } = tool()
    const outcome = await t.run(turnCapability(), { projectId: 'WEB', kind: 'STATE' }, { signal })
    expect(card).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      toolName: 'open_board', target: { kind: 'board', id: 'state', label: 'Task state' },
    }))
    expect(outcome).toMatchObject({ status: 'done', result: { shown: true, board: 'Task state', columns: [{ name: 'Backlog', count: 2 }, { name: 'To do', count: 1 }] } })
  })

  it('opens a saved board by its id', async () => {
    const { tool: t, card } = tool(async () => ({ board: { boardId: 'b1', name: 'Launch', kind: 'FIELD', builtIn: false }, columns: [] }))
    await t.run(turnCapability(), { projectId: 'WEB', boardId: 'b1' }, { signal })
    expect(card).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ target: { kind: 'board', id: 'b1', label: 'Launch' } }))
  })

  it("passes get_board's refusal on, in its own words, and shows nothing", async () => {
    const { tool: t, card } = tool(async () => { throw new ControlPlaneError('forbidden', 'get_board requires membership of this project') })
    expect(await t.run(turnCapability(), { projectId: 'WEB', kind: 'STATE' }, { signal })).toMatchObject({ status: 'refused', reason: expect.stringMatching(/membership/) })
    expect(card).not.toHaveBeenCalled()
  })

  it('is not offered to a turn that answers no one, or whose agent may never read boards', async () => {
    const { tool: t } = tool()
    expect(await t.offered(turnCapability({ actingUserId: null, readerUserId: 'u1' }))).toBe(false)
    const never = { bypassed: true, allowedTools: [], allowedBashPatterns: [], neverTools: ['get_board'] }
    expect(await t.offered(turnCapability({ permissions: never }))).toBe(false)
    expect(await t.offered(turnCapability())).toBe(true)
  })

  it('refuses arguments that do not fit, showing nothing', async () => {
    const { tool: t, card } = tool()
    expect(await t.run(turnCapability(), { kind: 'SIDEWAYS' }, { signal })).toMatchObject({ status: 'refused' })
    expect(card).not.toHaveBeenCalled()
  })
})
