import { describe, expect, it } from 'vitest'
import { showInTool, taskPath } from '../toolLink'

describe('Show in … on an action line @SC-1010', () => {
  it('opens the place\'s tool with the item marked, in the address the tools already take', () => {
    expect(showInTool({ kind: 'board', id: 'b 1', label: 'Launch' }, '/projects/AGX')).toEqual({ label: 'Show in Boards', href: '/projects/AGX?tool=boards&board=b%201' })
    expect(showInTool({ kind: 'task', id: 't1', label: 'AGX-4' }, '/chat')).toEqual({ label: 'Show in Tasks', href: '/chat?tool=tasks&task=t1' })
  })

  it('has no link for a kind with no tool, or without a target or a place', () => {
    expect(showInTool({ kind: 'file', id: 'f', label: 'x' }, '/chat')).toBeNull()
    expect(showInTool(undefined, '/chat')).toBeNull()
    expect(showInTool({ kind: 'task', id: 't1', label: 'x' }, undefined)).toBeNull()
  })

  it('opens a task on its own page', () => {
    expect(taskPath('AGX-4')).toBe('/tasks/AGX-4')
  })
})
