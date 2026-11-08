import { describe, expect, it } from 'vitest'
import { NO_COUNTS } from '../workroomRules'
import type { WorkroomAgent } from '../workroomTypes'
import { costText, countCards, elapsedText, lineWhyText, needAction, needWords, pausedNeeds, quietLine, ringDetail, startTitle, stopTitle } from '../workroomWords'

const NOW = new Date('2026-11-07T11:46:00Z')

const agent = (over: Partial<WorkroomAgent> = {}): WorkroomAgent => ({
  agentId: 'a', name: 'Writer', handle: 'writer', avatarUrl: null, role: null, ring: null, ready: 0, inLine: 0, runsToday: 0,
  spentToday: 0, now: [], line: [], needs: [], finishedToday: 0, lastFinished: null, ...over,
})

describe('the Workroom words', () => {
  it('prices today in dollars, estimated', () => {
    expect(costText(0)).toBe('$0')
    expect(costText(0.004)).toBe('<$0.01')
    expect(costText(0.2134)).toBe('$0.21')
  })

  it('says how long a run has gone', () => {
    expect(elapsedText('2026-11-07T11:45:40Z', NOW)).toBe('20 s')
    expect(elapsedText('2026-11-07T11:40:00Z', NOW)).toBe('6 min')
    expect(elapsedText('2026-11-07T09:40:00Z', NOW)).toBe('2 h')
    expect(elapsedText(null, NOW)).toBeNull()
  })

  it('ends every reason a task waits with what starts it', () => {
    expect(lineWhyText({ kind: 'next', after: 'Fix the contact form' })).toBe('next, after Fix the contact form')
    expect(lineWhyText({ kind: 'after', title: 'Draft the case-study page' })).toBe('after Draft the case-study page')
    expect(lineWhyText({ kind: 'siteBusy', siteName: 'fernhill-hq' })).toMatch(/fernhill-hq is busy; starts when one ends$/)
    expect(lineWhyText({ kind: 'siteAway', siteName: 'fernhill-studio' })).toMatch(/starts when fernhill-studio answers again$/)
    expect(lineWhyText({ kind: 'next', after: 'Fix the contact form' }, true)).toBe('next')
  })

  it('gives each Needs-you bar its words and its one answer', () => {
    expect([needWords('approval'), needAction('approval')]).toEqual(['needs your okay', 'Review'])
    expect([needWords('answer'), needAction('answer')]).toEqual(['asked you something', 'Answer'])
    expect([needWords('failed'), needAction('failed')]).toEqual(['failed', 'Run again'])
  })

  it("puts what an agent is doing in its ring's words", () => {
    const run = { key: 'r', kind: 'task' as const, title: 'T', taskId: 't', taskKey: 'WEB-1', href: null, sessionId: null, runNumber: 1, since: null, startedBy: null }
    expect(ringDetail(agent({ now: [run, { ...run, key: 'r2' }] }), 'RUNNING')).toBe('2 runs at work')
    expect(ringDetail(agent(), null)).toBeNull()
  })

  it('says why Start and Stop are greyed, or what they do', () => {
    expect(startTitle(agent({ ready: 3 }))).toBe('Runs Writer’s 3 ready tasks, after a confirm')
    expect(startTitle(agent())).toBe('No task is ready for Writer')
    expect(stopTitle(agent())).toBe('Nothing is running')
  })

  it('draws a quiet agent as one band and a line saying so', () => {
    expect(quietLine(agent(), { nothingYet: false, mine: false })).toBe('Nothing needs you, nothing running, nothing in line.')
    expect(quietLine(agent({ ready: 2 }), { nothingYet: true, mine: false })).toBe('2 tasks ready. Start runs them one at a time, in rank order.')
    expect(quietLine(agent(), { nothingYet: true, mine: false })).toBe('No task is ready: none in a To do column with Writer.')
    expect(quietLine(agent({ finishedToday: 3 }), { nothingYet: false, mine: true })).toBe('Nothing at work or in line · 3 finished today')
  })

  it('gives no quiet line to a card whose Now lists a run paused for the person, and leaves a failure to its bar', () => {
    const need = (reason: 'approval' | 'failed', taskKey: string) => ({ taskId: taskKey, taskKey, title: 'T', href: '/', reason, detail: null, runNumber: 1, since: NOW.toISOString() })
    expect(quietLine(agent({ needs: [need('approval', 'WEB-2')] }), { nothingYet: false, mine: false })).toBeNull()
    expect(pausedNeeds(agent({ needs: [need('approval', 'WEB-2'), need('failed', 'WEB-7')] })).map(n => n.taskKey)).toEqual(['WEB-2'])
    expect(quietLine(agent({ needs: [need('failed', 'WEB-7')] }), { nothingYet: false, mine: false })).toBe('Nothing at work or in line.')
  })

  it('counts about running only, with what makes up Needs you and Running', () => {
    const cards = countCards({ ...NO_COUNTS, needsYou: 4, needsAsking: 3, needsFailed: 1, running: 3, runningTasks: 3, spentToday: 0.44 })
    expect(cards.map(c => c.label)).toEqual(['Needs you', 'Running', 'Waiting', 'Finished today', 'Spent today'])
    expect(cards[0].detail).toBe('3 tasks · 1 failed · show only them')
    expect(cards[1].detail).toBe('3 tasks')
    expect(cards[4]).toMatchObject({ count: '$0.44', detail: 'tokens, estimated' })
    expect(countCards({ ...NO_COUNTS, needsYou: 2, running: 3, runningProjects: 2 }, { across: true, needsAgents: 2 })[1].detail).toBe('in 2 projects')
  })
})
