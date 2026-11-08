import { describe, it, expect } from 'vitest'
import { limitText, needsLine, pagerText, phoneLine, runRef, tokensText, tookText } from '../historyWords'
import type { RunHistoryRow } from '../../historyTypes'

const row = (over: Partial<RunHistoryRow> = {}): RunHistoryRow => ({
  runId: 'r1', sessionId: 's1', kind: 'task', taskKey: 'WEB-14', taskId: 't', number: 1, title: 'Fix the contact form', href: '/tasks/WEB-14',
  openable: true, place: { name: 'Website relaunch', projectKey: 'WEB' }, agent: null, group: 'running', ring: 'RUNNING', note: null,
  tookMs: 60_000, cost: 0.01, startedBy: 'you', at: '2026-11-07T11:45:00Z', ...over,
})

describe('the Runs history’s words', () => {
  it('names a run by its task and number, a routine’s by its number, a reply by nothing', () => {
    expect(runRef(row())).toBe('WEB-14 · 1')
    expect(runRef(row({ kind: 'routine', taskKey: null, number: 15 }))).toBe('Run 15')
    expect(runRef(row({ kind: 'reply', taskKey: null, number: null }))).toBe('—')
  })

  it('words how long, the limit, and the tokens with their cost', () => {
    expect([tookText(20_000), tookText(360_000), tookText(3_900_000), tookText(null)]).toEqual(['20 s', '6 min', '1 h 5 min', '—'])
    expect(limitText(60_000, 60)).toBe('1 min of 60 min')
    expect(limitText(40_000, 30)).toBe('40 s of 30 min')
    expect(limitText(10_800_000, 240)).toBe('3 h of 4 h')
    expect(tokensText(18_000, 0.02)).toBe('18k · about $0.02')
    expect(tokensText(null, null)).toBe('none reported')
  })

  it('says what Needs you holds, and where the page is in the list', () => {
    expect(needsLine({ all: 9, running: 1, waiting: 0, needs: 5, finished: 3 }, { asks: 3, failed: 1, routines: 1 })).toBe('Needs you 5: 3 tasks · 1 failed · 1 routine')
    expect(needsLine({ all: 1, running: 1, waiting: 0, needs: 0, finished: 0 }, { asks: 0, failed: 0, routines: 0 })).toBeNull()
    expect(pagerText({ total: 124, page: 1, pageSize: 20, capped: false }, 'newest')).toBe('1–20 of 124 · newest first')
    expect(pagerText({ total: 500, page: 25, pageSize: 20, capped: true }, 'cost')).toBe('481–500 of 500+ · by cost')
  })

  it('a phone’s second line, naming the project on the organisation’s Runs', () => {
    expect(phoneLine(row(), { withPlace: false })).toBe('WEB-14 · Run 1 · task · 1 min · $0.01 · you')
    expect(phoneLine(row(), { withPlace: true })).toBe('Website relaunch · WEB-14 · Run 1 · 1 min · $0.01')
    expect(phoneLine(row({ note: { tone: 'danger', lead: 'Failed', text: 'the build command' } }), { withPlace: false })).toBe('Failed: the build command · WEB-14 · Run 1 · you')
  })
})
