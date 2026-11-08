/** A task's plan (adr-0098): its dates, and an epic's span. */
import { describe, it, expect } from 'vitest'
import { epicSpan, planDates, refuseEpicRules } from '../planSpan'

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

describe('planDates @SC-552', () => {
  it('reads date strings as days', () => {
    expect(planDates({ planStart: '2026-10-08', planFinish: '2026-10-10' })).toEqual({ planStart: day('2026-10-08'), planFinish: day('2026-10-10') })
  })
  it('keeps what is not given, and clears what is null', () => {
    expect(planDates({ planStart: null })).toEqual({ planStart: null })
    expect(planDates({})).toEqual({})
  })
  it('refuses a finish before the start, and a date that is not one', () => {
    expect(() => planDates({ planStart: '2026-10-10', planFinish: '2026-10-08' })).toThrow(/finish/)
    expect(() => planDates({ planStart: 'soon' })).toThrow(/date/)
  })
})

describe('epicSpan @SC-554', () => {
  it('is the epic\'s own plan when it has one', () => {
    expect(epicSpan({ planStart: day('2026-10-01'), planFinish: day('2026-10-31') }, [
      { planStart: day('2026-09-01'), planFinish: day('2026-12-01') },
    ])).toEqual({ start: day('2026-10-01'), finish: day('2026-10-31'), fromTasks: false })
  })
  it('is the span of its tasks\' plans when it has none', () => {
    expect(epicSpan({ planStart: null, planFinish: null }, [
      { planStart: day('2026-10-05'), planFinish: day('2026-10-07') },
      { planStart: null, planFinish: day('2026-10-20') },
      { planStart: day('2026-10-02'), planFinish: null },
      { planStart: null, planFinish: null },
    ])).toEqual({ start: day('2026-10-02'), finish: day('2026-10-20'), fromTasks: true })
  })
  it('is nothing when neither it nor its tasks have a plan', () => {
    expect(epicSpan({ planStart: null, planFinish: null }, [{ planStart: null, planFinish: null }])).toBeNull()
  })
  it('fills the end it lacks from its tasks', () => {
    expect(epicSpan({ planStart: day('2026-10-01'), planFinish: null }, [
      { planStart: day('2026-10-05'), planFinish: day('2026-10-09') },
    ])).toEqual({ start: day('2026-10-01'), finish: day('2026-10-09'), fromTasks: false })
  })
})

describe('refuseEpicRules @SC-553', () => {
  const task = { id: 't', projectId: 'p', isEpic: false, epicId: null, hasTasks: false }
  const epic = { id: 'e', projectId: 'p', isEpic: true }
  it('lets a task join an epic of its own project', () => {
    expect(() => refuseEpicRules(task, { epic })).not.toThrow()
  })
  it('refuses an epic in an epic', () => {
    expect(() => refuseEpicRules({ ...task, isEpic: true }, { epic })).toThrow(/epic/)
    expect(() => refuseEpicRules({ ...task, epicId: 'e' }, { isEpic: true })).toThrow(/epic/)
  })
  it('refuses a task that is not an epic as the epic, and another project\'s', () => {
    expect(() => refuseEpicRules(task, { epic: { ...epic, isEpic: false } })).toThrow(/not an epic/)
    expect(() => refuseEpicRules(task, { epic: { ...epic, projectId: 'q' } })).toThrow(/project/)
    expect(() => refuseEpicRules(task, { epic: { ...epic, id: 't' } })).toThrow(/its own epic/)
  })
  it('refuses an epic that still groups tasks becoming a task again', () => {
    expect(() => refuseEpicRules({ ...task, isEpic: true, hasTasks: true }, { isEpic: false })).toThrow(/groups/)
    expect(() => refuseEpicRules({ ...task, isEpic: true, hasTasks: false }, { isEpic: false })).not.toThrow()
  })
  it('lets a task with an agent become an epic: an agent may manage one (D12)', () => {
    expect(() => refuseEpicRules({ ...task, assignedAgentId: 'a1' }, { isEpic: true })).not.toThrow()
  })
  it('gives a milestone only to an epic', () => {
    expect(() => refuseEpicRules(task, { milestone: { projectId: 'p' } })).toThrow(/milestone/)
    expect(() => refuseEpicRules({ ...task, isEpic: true }, { milestone: { projectId: 'q' } })).toThrow(/project/)
    expect(() => refuseEpicRules(task, { isEpic: true, milestone: { projectId: 'p' } })).not.toThrow()
  })
})
