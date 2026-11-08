import { describe, it, expect } from 'vitest'
import { sprintBoardPath } from '../sprintPaths'
import { screenOf } from '../../boards/useBoardsToolUrl'

describe('a sprint on a board', () => {
  it('opens the Task state board filtered to the sprint, not the Boards list', () => {
    const path = sprintBoardPath('WEB', 's 1')
    const params = new URL(path, 'http://hq').searchParams
    expect(params.get('tool')).toBe('boards')
    expect(screenOf(params)).toEqual({ kind: 'board', board: 'state', overrides: { sprint: 's 1' } })
  })
})
