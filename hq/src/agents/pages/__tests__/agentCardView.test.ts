import { describe, it, expect } from 'vitest'
import { agentCardNow, agentCardFacts, lastWorkedLabel, durationLabel } from '../agentCardView'
import { projectCardNow } from '../../../projects/pages/projectCardNow'
import type { AgentNow, NowItem } from '../../agentNow'

const at = new Date('2026-10-08T12:00:00.000Z')
const item = (over: Partial<NowItem>): NowItem => ({
  kind: 'needsYou', taskId: 't1', key: 'WEB-27', title: 'Fix the checkout redirect', projectId: 'p', projectName: 'Website',
  reason: 'wants to run a command', since: null, ...over,
})
const now = (over: Partial<AgentNow>): AgentNow => ({ state: 'idle', lead: null, needsYouCount: 0, runningCount: 0, next: null, ...over })

describe('what an agent card says it is doing @SC-583', () => {
  it('leads with Needs you and the task that wants something', () => {
    const lead = item({})
    expect(agentCardNow(now({ state: 'needsYou', lead, needsYouCount: 1 }), 3, at)).toEqual({ state: 'needsYou', detail: 'WEB-27 wants to run a command' })
  })

  it('counts the others beyond the first', () => {
    const lead = item({})
    expect(agentCardNow(now({ state: 'needsYou', lead, needsYouCount: 3 }), 3, at).detail).toBe('WEB-27 wants to run a command · +2 more')
  })

  it('leads with Running, the task and how long', () => {
    const lead = item({ kind: 'running', title: 'Plan the pricing page', reason: null, since: '2026-10-08T11:56:00.000Z' })
    expect(agentCardNow(now({ state: 'running', lead, runningCount: 1 }), 5, at)).toEqual({ state: 'running', detail: 'Plan the pricing page · 4 min' })
  })

  it('is Idle with what starts next', () => {
    const next = { kind: 'task', at: '2026-10-09T09:00:00.000Z', taskId: 't', key: 'WEB-31', title: 'x', projectId: 'p', projectName: 'Website' } as const
    const result = agentCardNow(now({ next }), 2, at)
    expect(result.state).toBe('idle')
    expect(result.detail).toMatch(/^▶ Tomorrow /)
  })

  it('says so when it is in no project yet', () => {
    expect(agentCardNow(now({}), 0, at)).toEqual({ state: 'idle', detail: 'in no project yet' })
    expect(agentCardNow(now({}), 2, at)).toEqual({ state: 'idle', detail: null })
  })
})

describe('an agent card’s numbers @SC-583', () => {
  it('counts projects, names the model and when it last worked', () => {
    expect(agentCardFacts({ projectCount: 1, lastWorkedAt: '2026-10-08T10:00:00.000Z', isKernel: false, state: 'idle' }, 'Sonnet 5.5', at))
      .toEqual(['1 project', 'Sonnet 5.5', 'Last worked 2 h ago'])
  })

  it('says Everywhere for the built-in agent, and drops last worked while it runs', () => {
    expect(agentCardFacts({ projectCount: 0, lastWorkedAt: '2026-10-08T10:00:00.000Z', isKernel: true, state: 'running' }, 'Sonnet 5.5', at))
      .toEqual(['Everywhere', 'Sonnet 5.5'])
  })

  it('reads times as minutes, hours, then a weekday', () => {
    expect(lastWorkedLabel('2026-10-08T11:30:00.000Z', at)).toBe('30 min ago')
    expect(lastWorkedLabel('2026-10-08T09:00:00.000Z', at)).toBe('3 h ago')
    expect(durationLabel('2026-10-08T11:56:00.000Z', at)).toBe('4 min')
  })
})

describe('what a project card says is happening @SC-583', () => {
  const line = { projectId: 'p', needsYouCount: 0, runningCount: 0, lastRunAt: null as string | null }
  it('Needs you with the tasks, and what is running', () => {
    expect(projectCardNow({ ...line, needsYouCount: 1, runningCount: 2 }, at)).toEqual({ state: 'needsYou', detail: '1 task · 2 running' })
  })
  it('Running when only runs are going', () => {
    expect(projectCardNow({ ...line, runningCount: 1 }, at)).toEqual({ state: 'running', detail: '1 running' })
  })
  it('Quiet with its last run, or alone', () => {
    expect(projectCardNow({ ...line, lastRunAt: '2026-10-08T09:00:00.000Z' }, at)).toEqual({ state: 'quiet', detail: 'last run 3 h ago' })
    expect(projectCardNow(line, at)).toEqual({ state: 'quiet', detail: null })
    expect(projectCardNow(undefined, at)).toEqual({ state: 'quiet', detail: null })
  })
})
