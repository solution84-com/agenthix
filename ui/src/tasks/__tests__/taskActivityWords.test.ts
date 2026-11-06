import { describe, expect, it } from 'vitest'
import { activityLines, type TaskActivityRowLike } from '../taskActivityWords'

let n = 0
const row = (kind: string, over: Partial<TaskActivityRowLike> = {}): TaskActivityRowLike =>
  ({ id: `a${++n}`, kind, by: 'person', name: 'Sam Okafor', runId: null, detail: {}, createdAt: new Date(2026, 10, 6, 9, 10), ...over })
const names = {
  board: (id: string) => ({ b1: 'Launch plan', b2: 'Sprint 3' }[id]),
  column: (_b: string, c: string) => ({ TODO: 'To do', IN_REVIEW: 'In review' }[c]),
  agent: (id: string) => ({ w: 'Writer' }[id]),
}
const text = (r: TaskActivityRowLike, all: TaskActivityRowLike[] = [r]) => activityLines(all, names).find(l => l.id === r.id)!.text

describe("a task's activity in words, one line each", () => {
  it('says who made it, changed it and assigned it', () => {
    expect(text(row('CREATED'))).toBe('Sam Okafor created it')
    expect(text(row('EDITED', { name: 'You', detail: { fields: ['title', 'planStart', 'planFinish'] } }))).toBe('You changed the title and the plan')
    expect(text(row('ASSIGNED', { detail: { fromAgentId: null, toAgentId: 'w' } }))).toBe('Writer was assigned by Sam Okafor')
    expect(text(row('ASSIGNED', { detail: { fromAgentId: 'w', toAgentId: null } }))).toBe('Sam Okafor unassigned Writer')
  })

  it('names the columns of a move on one board, and the board of a move to another', () => {
    const from = { boardId: 'b1', column: 'IN_REVIEW' }
    expect(text(row('MOVED', { by: 'agent', name: 'Writer', detail: { from: { boardId: 'b1', column: 'TODO' }, to: from } }))).toBe('Writer moved it from To do to In review')
    expect(text(row('MOVED', { detail: { from, to: { boardId: 'b2', column: null } } }))).toBe('Sam Okafor moved it to the board Sprint 3 · Backlog')
  })

  it("says a run's start and end by its stored number, with how long it took, and opens Runs at it", () => {
    const start = row('RUN_STARTED', { name: 'You', runId: 'r2', detail: { number: 2, startedBy: 'person' }, createdAt: new Date(2026, 10, 6, 9, 11) })
    const end = row('RUN_FINISHED', { by: 'agent', name: 'Writer', runId: 'r2', detail: { number: 2 }, createdAt: new Date(2026, 10, 6, 9, 14) })
    const lines = activityLines([end, start], names)
    expect(lines.map(l => l.text)).toEqual(['Run 2 finished · 3 min', 'Run 2 started by you'])
    expect(lines[0].opens).toEqual({ tab: 'runs', runId: 'r2' })
    expect(text(row('RUN_STARTED', { by: 'hq', name: null, runId: 'r3', detail: { number: 3, startedBy: 'schedule' } }))).toBe('Run 3 started on schedule')
    expect(text(row('RUN_FAILED', { by: 'agent', name: 'Writer', runId: 'r4', detail: { number: 4, reason: 'the model provider was overloaded' } }))).toBe('Run 4 failed · the model provider was overloaded')
    expect(text(row('RUN_STOPPED', { name: 'You', runId: 'r5', detail: { number: 5 } }))).toBe('You stopped Run 5')
    expect(text(row('RUN_STOPPED', { by: 'hq', name: null, runId: 'r6', detail: { number: 6 } }))).toBe('Run 6 stopped')
  })

  it("says an approval and a denial, naming the run from its start's number", () => {
    const start = row('RUN_STARTED', { runId: 'r2', detail: { number: 2 } })
    const ok = row('APPROVED', { name: 'You', runId: 'r2' })
    expect(text(ok, [ok, start])).toBe('You approved what Run 2 asked for')
    expect(text(row('DENIED', { runId: 'rx' }))).toBe('Sam Okafor denied what a run asked for')
  })

  it('says a comment and a reply, opening Comments at it, and the archive both ways', () => {
    const comment = row('COMMENTED', { detail: { commentId: 'c1', parentId: null } })
    expect(text(comment)).toBe('Sam Okafor commented')
    expect(activityLines([comment], names)[0].opens).toEqual({ tab: 'comments', commentId: 'c1' })
    expect(text(row('COMMENTED', { detail: { commentId: 'c2', parentId: 'c1' } }))).toBe('Sam Okafor replied to a comment')
    expect(text(row('ARCHIVED', { by: 'hq', name: null }))).toBe('HQ archived it')
    expect(text(row('UNARCHIVED'))).toBe('Sam Okafor took it out of the archive')
  })
})
