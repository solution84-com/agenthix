// @vitest-environment jsdom
/** A board's actions in the phone top bar's ⋯ (the Board design, D): New task first, then Start all agents…, then Talk. */
import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/client/operations', () => ({ useAction: (a: unknown) => a, duplicateBoardView: 'd', deleteBoardView: 'x', updateBoardView: 'u' }))

import { boardPhoneActions, type useBoardActions } from '../useBoardActions'

const actions = { newTask: vi.fn(), openSave: vi.fn(), saveChanges: vi.fn(), saveChangesWhy: null, moreItems: [] } as unknown as ReturnType<typeof useBoardActions>
const screen = { changed: false, view: null, choices: undefined, base: null } as never

describe('a board’s ⋯ on a phone', () => {
  it('has New task, then Start all agents…, then Talk about this board', () => {
    const rows = boardPhoneActions({ board: 'state', s: screen, actions, mayWork: true, talk: () => {}, startAll: () => {}, reset: () => {} })
    expect(rows.map(r => r.label)).toEqual(['New task', 'Start all agents…', 'Talk about this board'])
  })

  it('leaves Start all agents… out for someone who may not work in the project', () => {
    const rows = boardPhoneActions({ board: 'state', s: screen, actions, mayWork: false, talk: null, startAll: null, reset: () => {} })
    expect(rows.map(r => r.label)).toEqual(['New task'])
  })
})
