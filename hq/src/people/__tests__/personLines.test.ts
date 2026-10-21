import { describe, it, expect } from 'vitest'
import {
  personStatusLine, localTimeBeside, pickerSubline, orgRoleLabel, projectRoleLabel, firstName, lastHereText, canConfirmRemoval, matchesPerson,
  type ProjectPersonRowData,
} from '@agenthix/ui/people'

const AT = new Date('2026-10-08T12:00:00Z')
const person = { userId: 'u1', name: 'Dana Weber', handle: 'dana', avatarUrl: null, state: 'active' as const }
const idle = { state: 'idle' as const, lead: null, needsYouCount: 0, runningCount: 0 }
const lead = (kind: 'needsYou' | 'running') => ({
  kind, taskId: 't1', key: 'WEB-27', title: 'Fix the checkout redirect', projectId: 'p1', projectName: 'Web',
  reason: kind === 'needsYou' ? 'wants to run a command' : null, since: kind === 'running' ? '2026-10-08T11:50:00Z' : null,
})
const row = (now: ProjectPersonRowData['now'], lastActiveAt: string | null = null) => ({ person, now, lastActiveAt })

describe('personStatusLine @SC-597', () => {
  it('names the person a task waits on, and says you for the viewer', () => {
    const waiting = row({ state: 'needsYou', lead: lead('needsYou'), needsYouCount: 1, runningCount: 0 })
    expect(personStatusLine(waiting, false, AT)).toEqual({ label: 'Needs Dana', tone: 'needs', detail: 'WEB-27 wants to run a command' })
    expect(personStatusLine(waiting, true, AT).label).toBe('Needs you')
  })

  it('says what a running person is doing', () => {
    const line = personStatusLine(row({ state: 'running', lead: lead('running'), needsYouCount: 0, runningCount: 1 }), false, AT)
    expect(line.tone).toBe('live')
    expect(line.detail).toContain('Fix the checkout redirect')
  })

  it('says when someone was last here, or that they have not been', () => {
    expect(personStatusLine(row(idle, '2026-10-08T08:00:00Z'), false, AT).label).toBe('Last here today')
    expect(personStatusLine(row(idle, '2026-10-07T08:00:00Z'), false, AT).label).toBe('Last here yesterday')
    expect(personStatusLine(row(idle), false, AT)).toMatchObject({ label: 'Not active here yet', tone: 'muted' })
  })
})

describe('time, names and roles', () => {
  it('puts their local time beside the viewer\'s', () => {
    expect(localTimeBeside('Europe/Berlin', 'Asia/Phnom_Penh', AT)).toBe('14:00 · 5 h behind you')
    expect(localTimeBeside('Asia/Phnom_Penh', 'Europe/Berlin', AT)).toBe('19:00 · 5 h ahead of you')
    expect(localTimeBeside('Europe/Berlin', 'Europe/Berlin', AT)).toBe('14:00 · same time as you')
  })

  it('shows only their time when the viewer has none, and nothing when they have none or a bad zone', () => {
    expect(localTimeBeside('Europe/Berlin', null, AT)).toBe('14:00')
    expect(localTimeBeside(null, 'Europe/Berlin', AT)).toBeNull()
    expect(localTimeBeside('Not/AZone', 'Europe/Berlin', AT)).toBeNull()
  })

  it('shows the organisation roles as Admin and Member, and a project Viewer as Viewer (adr-0102) @SC-627', () => {
    expect([orgRoleLabel('ADMIN'), orgRoleLabel('MEMBER'), orgRoleLabel(null)]).toEqual(['Admin', 'Member', 'Former member'])
    expect([projectRoleLabel('ADMIN'), projectRoleLabel('MEMBER'), projectRoleLabel('VIEWER')]).toEqual(['Admin', 'Member', 'Viewer'])
  })

  it('takes a first name and a day word', () => {
    expect(firstName('Dana Weber')).toBe('Dana')
    expect(lastHereText('2026-10-01T08:00:00Z', AT)).toBe(new Date('2026-10-01T08:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))
  })

  it('tells two people with one first name apart by handle and projects', () => {
    expect(pickerSubline({ handle: 'avery.tan', roleLabel: 'Member', projectCount: 1, isMe: false })).toBe('@avery.tan · Member · in 1 project')
    expect(pickerSubline({ handle: 'avery', roleLabel: 'Admin', projectCount: 5, isMe: true })).toBe('@avery · Admin · you')
    expect(pickerSubline({ handle: 'ravi', roleLabel: 'Member', projectCount: 2, isMe: false })).toBe('@ravi · Member · in 2 projects')
  })
})

describe('Add: search @SC-599', () => {
  it('matches a name or a @handle, ignoring case', () => {
    expect(matchesPerson({ name: 'Avery Tan', handle: 'avery.tan' }, 'AVERY')).toBe(true)
    expect(matchesPerson({ name: 'Avery Tan', handle: 'avery.tan' }, '@avery.t')).toBe(true)
    expect(matchesPerson({ name: 'Dana Weber', handle: 'dana' }, 'avery')).toBe(false)
    expect(matchesPerson({ name: 'Former member', handle: null }, 'dana')).toBe(false)
    expect(matchesPerson({ name: 'Dana', handle: 'dana' }, '  ')).toBe(true)
  })
})

describe('Remove: nothing is chosen for the person', () => {
  it('needs a choice while open tasks exist', () => {
    expect(canConfirmRemoval(3, null, '')).toBe(false)
    expect(canConfirmRemoval(3, 'person', '')).toBe(false)
    expect(canConfirmRemoval(3, 'person', 'u2')).toBe(true)
    expect(canConfirmRemoval(3, 'wait', '')).toBe(true)
  })

  it('needs none when there are no open tasks', () => {
    expect(canConfirmRemoval(0, null, '')).toBe(true)
  })
})
