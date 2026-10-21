import { describe, expect, it } from 'vitest'
import { codeLifetime, connectCommand, joinPhase, timeLeft, type JoinView } from '../pages/add/joinWords'

const NOW = new Date('2026-10-15T10:00:00Z')
const inMs = (ms: number) => new Date(NOW.getTime() + ms).toISOString()
const MACHINE = { name: 'office-server', fingerprint: 'f'.repeat(64), fingerprintShort: '8F3A 91C2 E04B 7D55' }

const view = (over: Partial<JoinView> = {}): JoinView => ({
  joinId: 'j1', state: 'waiting', expiresAt: inMs(14 * 60_000 + 12_000), machine: null, replaces: null, hqClaim: null,
  siteName: null, problem: null, ...over,
})

describe('the join, in words @SC-903', () => {
  it('waiting: how long the code still works', () => {
    expect(joinPhase(view(), NOW)).toEqual({ phase: 'waiting', left: '14:12 left' })
  })

  it('arrived: the machine to compare, with what the Fleet Console warns of', () => {
    const p = joinPhase(view({
      state: 'confirming', machine: MACHINE,
      replaces: { siteName: 'office', machineName: 'office-server', warning: 'This machine is already in the fleet as office on office-server; confirming replaces it.' },
      hqClaim: { text: 'This machine says it runs HQ.', marks: true },
    }), NOW)
    expect(p).toEqual({
      phase: 'arrived', machine: MACHINE,
      warnings: ['This machine is already in the fleet as office on office-server; confirming replaces it.', 'This machine says it runs HQ.'],
    })
  })

  it('confirm, then the site starts: each step as the Fleet Console says it', () => {
    const accepting = joinPhase(view({ state: 'accepting', machine: MACHINE }), NOW)
    expect(accepting.phase).toBe('working')
    expect(accepting.phase === 'working' && accepting.steps.map(s => s.state)).toEqual(['current', 'todo', 'todo'])
    const installing = joinPhase(view({ state: 'installing', machine: MACHINE, siteName: 'office-server' }), NOW)
    expect(installing.phase === 'working' && installing.steps.map(s => s.state)).toEqual(['done', 'current', 'todo'])
    const done = joinPhase(view({ state: 'done', machine: MACHINE, siteName: 'office-server' }), NOW)
    expect(done).toMatchObject({ phase: 'done', siteName: 'office-server', note: null })
    expect(done.phase === 'done' && done.steps.every(s => s.state === 'done')).toBe(true)
  })

  it('the site could not be installed: why, and that confirming again tries again', () => {
    const p = joinPhase(view({ state: 'failed', machine: MACHINE, siteName: 'office-server', problem: 'The image could not be fetched.' }), NOW)
    expect(p).toMatchObject({ phase: 'failed', problem: 'The image could not be fetched.', canRetry: true })
    expect(p.phase === 'failed' && p.steps.map(s => s.state)).toEqual(['done', 'failed', 'todo'])
  })

  it('turned away before anything was accepted: why, and no retry', () => {
    const p = joinPhase(view({ state: 'failed', machine: MACHINE, problem: 'This machine is already in the fleet …' }), NOW)
    expect(p).toMatchObject({ phase: 'failed', canRetry: false })
  })

  it('expired: the code ran out, or the Fleet Console no longer knows it', () => {
    expect(joinPhase(view({ expiresAt: inMs(-1) }), NOW)).toEqual({ phase: 'expired' })
    expect(joinPhase(view({ state: 'confirming', machine: MACHINE, expiresAt: inMs(-1) }), NOW)).toEqual({ phase: 'expired' })
    expect(joinPhase(null, NOW)).toEqual({ phase: 'expired' })
  })

  it('refused: whatever the last read said', () => {
    expect(joinPhase(view({ state: 'confirming', machine: MACHINE }), NOW, true)).toEqual({ phase: 'refused' })
    expect(joinPhase(null, NOW, true)).toEqual({ phase: 'refused' })
  })
})

describe('the code and its command @SC-903', () => {
  it('says how long it works, from when it was given', () => {
    expect(codeLifetime(inMs(60 * 60_000), NOW)).toBe('Works once, for the next 60 minutes.')
    expect(codeLifetime(inMs(60_000), NOW)).toBe('Works once, for the next minute.')
  })

  it('the time left never goes below nothing', () => {
    expect(timeLeft(inMs(-5000), NOW)).toBe('0:00 left')
    expect(timeLeft(inMs(65_000), NOW)).toBe('1:05 left')
  })

  it("the command names HQ's address, or says where it goes", () => {
    expect(connectCommand('https://hq.acme.example', 'K7QM-4XPD-93TB')).toBe('agenthix console connect https://hq.acme.example K7QM-4XPD-93TB')
    expect(connectCommand(null, 'K7QM-4XPD-93TB')).toBe('agenthix console connect <hq address> K7QM-4XPD-93TB')
  })
})
