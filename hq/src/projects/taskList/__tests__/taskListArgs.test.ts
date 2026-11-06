/** What a task list is asked for comes from the browser: each field is checked, and anything else refused. */
import { describe, it, expect } from 'vitest'
import { parseTaskListArgs, TASK_LIST_PAGE } from '../taskListArgs'

describe('the list’s arguments', () => {
  it('reads the scorecard, filters, order and page', () => {
    expect(parseTaskListArgs({ card: 'waiting', sort: 'planDate', type: 'epic', priority: 'HIGH', agentId: 'a-1', search: '  copy ', limit: 100 }))
      .toMatchObject({ card: 'waiting', sort: 'planDate', type: 'epic', priority: 'HIGH', agentId: 'a-1', search: 'copy', limit: 100, archived: false })
  })

  it('leaves out what is empty, and pages by default', () => {
    expect(parseTaskListArgs(undefined)).toMatchObject({ card: undefined, sort: undefined, agentId: undefined, search: undefined, limit: TASK_LIST_PAGE })
    expect(parseTaskListArgs({ agentId: '', card: null }).agentId).toBeUndefined()
  })

  it('caps the page and the search', () => {
    expect(parseTaskListArgs({ limit: 100_000 }).limit).toBe(500)
    expect(parseTaskListArgs({ search: 'x'.repeat(1000) }).search).toHaveLength(200)
  })

  it('refuses what it cannot read, saying nothing was changed', () => {
    expect(() => parseTaskListArgs({ card: 'everything' })).toThrow(/card must be one of .*Nothing was changed\./)
    expect(() => parseTaskListArgs({ sort: 'random' })).toThrow(/sort/)
    expect(() => parseTaskListArgs({ agentId: { not: '' } })).toThrow(/agentId is not an id/)
    expect(() => parseTaskListArgs({ boardId: "x' OR 1=1" })).toThrow(/boardId/)
    expect(() => parseTaskListArgs({ limit: -1 })).toThrow(/limit/)
    expect(() => parseTaskListArgs({ limit: 1.5 })).toThrow(/limit/)
    expect(() => parseTaskListArgs({ archived: 'yes' })).toThrow(/archived/)
    expect(() => parseTaskListArgs({ search: 5 })).toThrow(/search/)
  })
})
