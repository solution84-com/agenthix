// @vitest-environment jsdom
/** A board's header at its width: the long buttons fold into ⋯ before the board's name is squeezed. */
import { describe, expect, it, vi } from 'vitest'

vi.mock('wasp/client/operations', () => ({ useAction: (a: unknown) => a, duplicateBoardView: 'd', deleteBoardView: 'x', updateBoardView: 'u' }))

import { boardHeaderButtons, FOLD_START_ALL_BELOW, FOLD_TALK_BELOW } from '../useBoardActions'

const startAll = () => {}
const talk = () => {}
const moreItems = [{ label: 'Save as new board…', onSelect: () => {} }]

describe('a board’s header buttons', () => {
  it('shows every button where the board is wide enough', () => {
    const b = boardHeaderButtons({ width: FOLD_START_ALL_BELOW, startAll, talk, moreItems })
    expect(b.startAll).toBe(startAll)
    expect(b.talk).toBe(talk)
    expect(b.moreItems.map(i => i.label)).toEqual(['Save as new board…'])
  })

  it('folds Start all agents… into ⋯ first, above the board’s own items', () => {
    const b = boardHeaderButtons({ width: FOLD_START_ALL_BELOW - 1, startAll, talk, moreItems })
    expect(b.startAll).toBeNull()
    expect(b.talk).toBe(talk)
    expect(b.moreItems.map(i => i.label)).toEqual(['Start all agents…', 'Save as new board…'])
    expect(b.moreItems[1].separatorBefore).toBe(true)
  })

  it('then folds Talk about this board too', () => {
    const b = boardHeaderButtons({ width: FOLD_TALK_BELOW - 1, startAll, talk, moreItems })
    expect(b.startAll).toBeNull()
    expect(b.talk).toBeNull()
    expect(b.moreItems.map(i => i.label)).toEqual(['Start all agents…', 'Talk about this board', 'Save as new board…'])
  })

  it('adds nothing to ⋯ for someone who has neither button', () => {
    const b = boardHeaderButtons({ width: 700, startAll: null, talk: null, moreItems })
    expect(b.moreItems).toEqual(moreItems)
  })
})
