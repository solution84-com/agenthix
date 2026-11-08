import { describe, expect, it } from 'vitest'
import { activityLines, type TaskActivityRowLike } from '../taskActivityWords'

let n = 0
const row = (kind: string, over: Partial<TaskActivityRowLike> = {}): TaskActivityRowLike =>
  ({ id: `a${++n}`, kind, by: 'person', name: 'Sam Okafor', runId: null, detail: {}, createdAt: new Date(2026, 10, 6, 9, 10), ...over })
const names = {
  column: (id: string) => ({ c1: 'To do', c2: 'In review' }[id]),
  agent: (id: string) => ({ w: 'Writer' }[id]),
  field: (id: string) => ({ f1: 'Severity' }[id]),
}
const text = (r: TaskActivityRowLike, all: TaskActivityRowLike[] = [r]) => activityLines(all, names).find(l => l.id === r.id)!.text

describe("a task's activity in words, one line each", () => {
  it('says who made it, changed it and assigned it', () => {
    expect(text(row('CREATED'))).toBe('Sam Okafor created it')
    expect(text(row('EDITED', { name: 'You', detail: { fields: ['title', 'planStart', 'planFinish'] } }))).toBe('You changed the title and the plan')
    expect(text(row('ASSIGNED', { detail: { fromAgentId: null, toAgentId: 'w' } }))).toBe('Writer was assigned by Sam Okafor')
    expect(text(row('ASSIGNED', { detail: { fromAgentId: 'w', toAgentId: null } }))).toBe('Sam Okafor unassigned Writer')
  })

  it('names the sprint and a custom field by their words, never by their ids', () => {
    expect(text(row('EDITED', { name: 'You', detail: { fields: ['sprintId', 'field:f1'] } }))).toBe('You changed its sprint and the Severity')
    expect(text(row('EDITED', { name: 'You', detail: { fields: ['field:gone'] } }))).toBe('You changed a field')
  })

  it("names the columns of a move by its type's columns, and says only that it moved when they are gone", () => {
    expect(text(row('MOVED', { by: 'agent', name: 'Writer', detail: { fromColumnId: 'c1', toColumnId: 'c2' } }))).toBe('Writer moved it from To do to In review')
    expect(text(row('MOVED', { detail: { fromColumnId: 'gone', toColumnId: 'c2' } }))).toBe('Sam Okafor moved it to In review')
    expect(text(row('MOVED', { detail: { fromColumnId: 'gone', toColumnId: 'gone' } }))).toBe('Sam Okafor moved it')
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
