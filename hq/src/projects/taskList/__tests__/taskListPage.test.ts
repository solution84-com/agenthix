/** One page of a task list: the filters, the counts over them but the chosen scorecard, the order and the page. @SC-513 */
import { describe, it, expect } from 'vitest'
import { pageOf, type ListedRow } from '../taskListPage'
import { importanceRank, type ListState } from '../taskListRules'

let n = 0
function row(state: ListState, over: Partial<ListedRow> = {}): ListedRow {
  n += 1
  return {
    id: `t${n}`, title: `Task ${n}`, number: n, projectId: 'p1', projectKey: 'WEB', isEpic: false, epicId: null,
    agentId: 'writer', boardId: 'b1', queuedByUserId: null, priority: 'MEDIUM', state, rank: importanceRank(state),
    planDate: null, updatedAt: new Date(2026, 10, 1, 0, n), createdAt: new Date(2026, 9, 1, 0, n), ...over,
  }
}

const okay = row({ card: 'needsYou', why: 'okay' }, { title: 'Write the home page copy', agentId: 'writer' })
const failed = row({ card: 'needsYou', why: 'failed' }, { agentId: 'tester' })
const running = row({ card: 'running' }, { priority: 'HIGH' })
const onSam = row({ card: 'waiting', onUserId: 'sam' }, { queuedByUserId: 'priya' })
const queued = row({ card: 'waiting', onUserId: null })
const fresh = row({ card: 'notStarted' }, { boardId: 'b2', priority: 'LOW' })
const done = row({ card: 'done', finished: false })
const epic = row({ card: null }, { isEpic: true, rank: 0, agentId: null, title: 'Launch pages' })
const inEpic = row({ card: 'notStarted' }, { epicId: epic.id })
const all = [done, fresh, queued, onSam, running, failed, okay, epic, inEpic]

describe('a page of the list', () => {
  it('sorts by Importance by default, an epic by its most pressing task', () => {
    // Ties: priority, then what changed last.
    expect(pageOf(all, {}).rows.map(r => r.id)).toEqual([epic.id, okay.id, failed.id, running.id, queued.id, onSam.id, inEpic.id, fresh.id, done.id])
  })

  it('counts follow the filters but not the chosen scorecard', () => {
    const page = pageOf(all, { card: 'needsYou', agentId: 'writer' })
    expect(page.rows.map(r => r.id)).toEqual([okay.id])
    expect(page.counts.all).toBe(7)
    expect(page.counts.needsYou).toEqual({ count: 1, okay: 1, failed: 0, noAgent: 0 })
    expect(page.counts.running.count).toBe(1)
  })

  it('filters by type, epic, board, priority, who queued it and whom it waits on', () => {
    expect(pageOf(all, { type: 'epic' }).rows.map(r => r.id)).toEqual([epic.id])
    expect(pageOf(all, { type: 'task' }).rows).toHaveLength(8)
    expect(pageOf(all, { epicId: epic.id }).rows.map(r => r.id)).toEqual([inEpic.id])
    expect(pageOf(all, { boardId: 'b2' }).rows.map(r => r.id)).toEqual([fresh.id])
    expect(pageOf(all, { priority: 'HIGH' }).rows.map(r => r.id)).toEqual([running.id])
    expect(pageOf(all, { queuedByUserId: 'priya' }).rows.map(r => r.id)).toEqual([onSam.id])
    expect(pageOf(all, { waitingOnUserId: 'sam' }).rows.map(r => r.id)).toEqual([onSam.id])
  })

  it('searches titles and keys', () => {
    expect(pageOf(all, { search: 'home page' }).rows.map(r => r.id)).toEqual([okay.id])
    expect(pageOf(all, { search: `WEB-${fresh.number}` }).rows.map(r => r.id)).toEqual([fresh.id])
  })

  it('answers a page, and says when there are more', () => {
    const page = pageOf(all, { limit: 4 })
    expect(page.rows).toHaveLength(4)
    expect(page.hasMore).toBe(true)
    expect(pageOf(all, { limit: 9 }).hasMore).toBe(false)
  })
})
