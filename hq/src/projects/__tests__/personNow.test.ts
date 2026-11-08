import { describe, it, expect } from 'vitest'
import { workOfPerson, type PersonTask } from '../personNow'

let n = 0
const task = (over: Partial<PersonTask>): PersonTask => ({
  id: `t${++n}`, number: n, title: `Task ${n}`, projectId: 'p', projectKey: 'WEB', projectName: 'Website',
  state: 'TODO', runState: 'RUN_NONE', runStateReason: null, assignedAgentId: 'a',
  scheduleNextDueAt: null, lastWorkedAt: null, updatedAt: new Date('2026-10-08T10:00:00Z'),
  onBehalfOfUserId: 'dana', runOnBehalfOfUserId: null,
  ...over,
})

describe('workOfPerson @SC-596', () => {
  it('waits on the person a run is for: who started it, else the task\'s person', () => {
    const blockedForDana = task({ runState: 'RUN_BLOCKED', runStateReason: 'wants to run a command' })
    const startedByLee = task({ runState: 'RUN_BLOCKED', runStateReason: 'wants to write a file', runOnBehalfOfUserId: 'lee' })
    const open = [blockedForDana, startedByLee]

    const dana = workOfPerson('dana', open, new Map())
    const lee = workOfPerson('lee', open, new Map())

    expect(dana.now).toMatchObject({ state: 'needsYou', needsYouCount: 1 })
    expect(dana.now.lead).toMatchObject({ key: `WEB-${blockedForDana.number}`, reason: 'wants to run a command' })
    expect(lee.now).toMatchObject({ state: 'needsYou', needsYouCount: 1 })
    expect(lee.now.lead).toMatchObject({ taskId: startedByLee.id })
  })

  it('says what they are doing when nothing waits on them, and idle when nothing runs', () => {
    const running = task({ state: 'IN_PROGRESS', runState: 'RUN_ACTIVE' })
    expect(workOfPerson('dana', [running], new Map()).now).toMatchObject({ state: 'running', runningCount: 1 })
    expect(workOfPerson('sam', [running], new Map()).now).toMatchObject({ state: 'idle', lead: null })
  })

  it("counts the tasks done on their behalf by state, with the finished ones counted apart", () => {
    const open = [
      task({}),
      task({ state: 'IN_PROGRESS' }),
      task({ onBehalfOfUserId: 'lee' }),
    ]
    expect(workOfPerson('dana', open, new Map([['dana', 3]])).tasks).toMatchObject({ todo: 1, inProgress: 1, done: 3, total: 5 })
  })
})
