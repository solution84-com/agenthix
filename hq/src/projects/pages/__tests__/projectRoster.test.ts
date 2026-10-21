import { describe, it, expect } from 'vitest'
import { agentsForProjectPicker } from '../projectRoster'

const ALL = [
  { id: 'a1', name: 'One' },
  { id: 'a2', name: 'Two' },
  { id: 'a3', name: 'Three' },
]
const project = { agents: [{ agent: { id: 'a1' } }, { agent: { id: 'a3' } }] }

describe('agentsForProjectPicker (R-109)', () => {
  it("offers only the project's assigned agents", () => {
    expect(agentsForProjectPicker(ALL, project).map(a => a.id)).toEqual(['a1', 'a3'])
  })

  it('keeps the full agent rows, so the picker still has what it shows', () => {
    expect(agentsForProjectPicker(ALL, project)[0]).toBe(ALL[0])
  })

  it('offers nothing until the project has loaded', () => {
    expect(agentsForProjectPicker(ALL, undefined)).toEqual([])
    expect(agentsForProjectPicker(ALL, null)).toEqual([])
    expect(agentsForProjectPicker(ALL, {})).toEqual([])
  })

  it('offers nothing when the project has no agents', () => {
    expect(agentsForProjectPicker(ALL, { agents: [] })).toEqual([])
  })

  it('keeps the current assignee listed after it left the roster', () => {
    expect(agentsForProjectPicker(ALL, project, 'a2').map(a => a.id)).toEqual(['a1', 'a2', 'a3'])
  })

  it('ignores a current assignee that is not a known agent', () => {
    expect(agentsForProjectPicker(ALL, project, 'gone').map(a => a.id)).toEqual(['a1', 'a3'])
  })
})
