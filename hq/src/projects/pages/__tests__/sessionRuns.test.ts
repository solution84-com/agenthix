/** A task's session shown as its runs (every screen reviewed spec §3): a divider for each run's start and end. */
import { describe, it, expect } from 'vitest'
import { segmentSession, type SessionRunInfo } from '@agenthix/ui/tasks'

const entry = (id: string, at: string) => ({
  id, role: 'ASSISTANT', content: id, thought: null, thinkingDurationMs: null, toolName: null, toolInput: null,
  toolOutput: null, model: null, createdAt: at, usage: null,
})
const run = (id: string, createdAt: string, status: string, endedAt: string | null, startedBy?: string): SessionRunInfo =>
  ({ id, status, createdAt, endedAt, startedBy })

describe('a session as its runs @SC-516', () => {
  const runs = [
    run('r2', '2026-10-07T10:05:00', 'RUNNING', null),
    run('r1', '2026-10-07T09:31:00', 'CANCELLED', '2026-10-07T09:58:00', 'started by Avery'),
  ]
  const entries = [entry('a', '2026-10-07T09:32:00'), entry('b', '2026-10-07T09:50:00'), entry('c', '2026-10-07T10:06:00')]

  it('puts each entry under the run that had started when it was written, runs oldest first', () => {
    const segs = segmentSession(entries, runs)
    expect(segs.map(s => s.entries.map(e => e.id))).toEqual([['a', 'b'], ['c']])
    expect(segs.map(s => s.number)).toEqual([1, 2])
  })

  it('writes the start, who started it and how it ended', () => {
    const [first, second] = segmentSession(entries, runs)
    expect(first.start).toBe('Run 1 · 09:31 · started by Avery')
    expect(first.end).toBe('Run 1 stopped · 09:58')
    expect(second.start).toBe('Run 2 · 10:05')
    expect(second.end).toBeNull()
  })

  it('says a run waits for the person when its tool request is pending', () => {
    expect(segmentSession(entries, runs, 'r2')[1].end).toBe('Run 2 waiting for you')
  })

  it('keeps entries older than every known run under no run', () => {
    const segs = segmentSession([entry('old', '2026-10-06T08:00:00')], runs)
    expect(segs[0].run).toBeNull()
    expect(segs[0].start).toBeNull()
  })

  it('keeps a run end before the messages written after it, and a later run after them', () => {
    const rs = [
      run('r1', '2026-10-07T09:20:00', 'CANCELLED', '2026-10-07T09:29:00'),
      run('r2', '2026-10-07T09:31:00', 'COMPLETED', '2026-10-07T09:40:00', 'started by Ana'),
    ]
    const segs = segmentSession([entry('in1', '2026-10-07T09:25:00'), entry('msg', '2026-10-07T09:30:00'), entry('in2', '2026-10-07T09:35:00')], rs)
    expect(segs.map(s => [s.run?.id ?? null, s.entries.map(e => e.id)])).toEqual([['r1', ['in1']], [null, ['msg']], ['r2', ['in2']]])
    expect(segs[2].start).toBe('Run 2 · 09:31 · started by Ana')
  })
})
