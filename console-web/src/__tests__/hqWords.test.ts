import { describe, expect, it } from 'vitest'
import type { InstallFigures } from '@agenthix/core'
import {
  commandWords, erasedAddress, localChange, frontDoorLine, graceWords, hasOwnDomain, hqCondition, hqHealth, uploadedFiles, whatFollows,
} from '../pages/hq/hqWords'
import { hqMoveProgress } from '../pages/hq/hqMoveWords'
import type { FleetHost } from '../pages/dashboard/types'
import type { Move } from '../pages/site/move/moveWords'

const NOW = new Date('2026-10-13T15:00:00')
const hqInstall = (over: Partial<InstallFigures> = {}): InstallFigures => ({
  target: 'hq', version: '0.2.0', state: 'running', since: '2026-09-22T10:00:00', healthy: true, problem: null, ...over,
})

describe("HQ's condition @SC-910", () => {
  it('reads suspended and erased from the figures', () => {
    expect(hqCondition(hqInstall(), null)).toEqual({ kind: 'running' })
    expect(hqCondition(hqInstall({ state: 'suspended', since: '2026-10-13T14:10:00' }), null)).toEqual({ kind: 'suspended', since: '2026-10-13T14:10:00' })
    const erased = hqCondition(hqInstall({ state: 'erased', since: '2026-10-13T15:02:00.000Z' }), null)
    expect(erased).toEqual({ kind: 'erased', since: '2026-10-13T15:02:00.000Z', keptUntil: '2026-11-12T15:02:00.000Z' })
  })

  it('takes what was asked here when it is newer than the figures', () => {
    const local = { kind: 'suspended' as const, at: '2026-10-13T14:10:00.000Z' }
    expect(hqCondition(hqInstall({ since: '2026-09-22T10:00:00.000Z' }), local)).toEqual({ kind: 'suspended', since: local.at })
    // Resumed on the machine since: the figures are newer, and win.
    expect(hqCondition(hqInstall({ since: '2026-10-13T14:30:00.000Z' }), local)).toEqual({ kind: 'running' })
    expect(hqCondition(undefined, { kind: 'erased', at: '2026-10-13T15:02:00.000Z', purgeAfter: '2026-11-20T00:00:00.000Z' }))
      .toEqual({ kind: 'erased', since: '2026-10-13T15:02:00.000Z', keptUntil: '2026-11-20T00:00:00.000Z' })
  })

  it('a resume answered here wins over figures read before it', () => {
    expect(hqCondition(hqInstall({ state: 'suspended', since: '2026-10-13T14:10:00.000Z' }), { kind: 'resumed', at: '2026-10-13T14:30:00.000Z' })).toEqual({ kind: 'running' })
  })

  it('takes a suspend or an erase as done when answered, or when the machine went quiet after answering before', () => {
    const at = '2026-10-13T14:10:00.000Z'
    expect(localChange({ action: 'suspend', at, wasOnline: true }, { phase: 'working' }, true)).toBeNull()
    expect(localChange({ action: 'suspend', at, wasOnline: true }, { phase: 'working' }, false)).toEqual({ kind: 'suspended', at })
    expect(localChange({ action: 'suspend', at, wasOnline: false }, { phase: 'working' }, false)).toBeNull()
    expect(localChange({ action: 'suspend', at, wasOnline: true }, { phase: 'refused', message: 'no' }, false)).toBeNull()
    expect(localChange({ action: 'erase', at, wasOnline: true }, { phase: 'done', result: { purgeAfter: '2026-11-12T00:00:00.000Z' } }, true))
      .toEqual({ kind: 'erased', at, purgeAfter: '2026-11-12T00:00:00.000Z' })
    expect(localChange({ action: 'resume', at, wasOnline: true }, { phase: 'done', result: { state: 'started' } }, true)).toEqual({ kind: 'resumed', at })
    expect(localChange({ action: 'eraseLater', at, wasOnline: true }, { phase: 'done', result: {} }, true)).toBeNull()
  })

  it('is unknown before the first figures', () => {
    expect(hqCondition(undefined, null)).toEqual({ kind: 'unknown' })
  })

  it('says how HQ is, in a sentence', () => {
    expect(hqHealth(hqInstall(), true)).toEqual({ label: 'Healthy', tone: 'healthy', sentence: 'Healthy — people can sign in' })
    expect(hqHealth(hqInstall({ healthy: false, state: 'failed', problem: 'hq-server keeps restarting.' }), true).sentence).toBe('hq-server keeps restarting.')
    expect(hqHealth(hqInstall(), false).label).toBe('Not answering')
  })

  it('counts the days of the grace period left', () => {
    const w = graceWords({ kind: 'erased', since: '2026-10-13T15:02:00', keptUntil: '2026-11-12T15:02:00' }, new Date('2026-10-14T15:00:00'))
    expect(w.pill).toBe('HQ erased — restorable until 12 Nov')
    expect(w.sentence).toMatch(/kept until 12 Nov — 29 days left\./)
  })
})

describe('the front door line @SC-915', () => {
  const door = { on: false, certificateExpiresAt: null, renewalProblem: null }
  it('your own web server, the default', () => {
    const l = frontDoorLine(door, 'https://hq.acme.example', NOW)
    expect(l.title).toBe('Your own web server')
    expect(l.pill).toBe('Not checked by Agenthix')
    expect(l.text).toMatch(/passing WebSocket upgrades/)
  })
  it("the host service's own, with its certificates", () => {
    const l = frontDoorLine({ on: true, certificateExpiresAt: '2026-12-12T00:00:00', renewalProblem: null }, 'https://hq.acme.example', NOW)
    expect(l.title).toBe("The host service's front door")
    expect(l.pill).toBe('Certificates valid')
    expect(l.text).toBe('Holds ports 80 and 443 · certificates for hq.acme.example and its uploaded files · valid until 12 Dec, renewed by themselves before then')
  })
  it('renewal failing: the host service\'s own words', () => {
    const l = frontDoorLine({ on: true, certificateExpiresAt: '2026-10-20T00:00:00', renewalProblem: 'Its DNS does not point at hq-box.' }, 'https://hq.acme.example', NOW)
    expect(l).toMatchObject({ pill: 'Renewal failing', tone: 'danger' })
    expect(l.text).toBe('Its DNS does not point at hq-box. The certificate expires on 20 Oct.')
  })
  it('uploaded files: a host of their own, or none on a bare network address', () => {
    expect(uploadedFiles('https://hq.acme.example')).toMatch(/^files\.hq\.acme\.example/)
    expect(uploadedFiles('http://192.168.1.20:4100')).toBe('No separate host on a bare network address — uploaded files are offered as downloads only, never shown in the page.')
  })
  it('an own domain is a name, not a network address', () => {
    expect(hasOwnDomain('https://hq.acme.example')).toBe(true)
    expect(hasOwnDomain('http://192.168.1.20:4100')).toBe(false)
    expect(hasOwnDomain('http://[::1]:4100')).toBe(false)
    expect(hasOwnDomain('http://localhost:4100')).toBe(false)
  })
})

describe("erasing: HQ's address typed in @SC-911", () => {
  it('takes the address, or its host name, and sends the address', () => {
    expect(erasedAddress('hq.acme.example', 'https://hq.acme.example')).toBe('https://hq.acme.example')
    expect(erasedAddress(' https://hq.acme.example ', 'https://hq.acme.example')).toBe('https://hq.acme.example')
    expect(erasedAddress('hq.acme.o', 'https://hq.acme.example')).toBeNull()
    expect(erasedAddress('', 'https://hq.acme.example')).toBeNull()
  })
})

describe("an action's answer, in words", () => {
  it('names what did not happen, then the host service\'s own words', () => {
    expect(commandWords('suspend', { phase: 'refused', message: 'HQ is already suspended; nothing is lost.' }))
      .toEqual({ tone: 'danger', title: 'HQ was not suspended', text: 'HQ is already suspended; nothing is lost.' })
    expect(commandWords('frontDoor', { phase: 'refused', message: 'Refused: port 443 is in use.' })!.title).toBe('The front door was not turned on')
    expect(commandWords('erase', { phase: 'refused', message: "Not erased: that is not HQ's address." })!.title).toBe('HQ was not erased')
    expect(commandWords('resume', { phase: 'working' })).toEqual({ tone: 'neutral', title: 'Resuming HQ…', text: 'HQ starts again as it was; sites reconnect when it answers.' })
    expect(commandWords('address', { phase: 'done', result: { address: 'http://192.168.1.30:4100' } })!.text).toBe('HQ now answers at http://192.168.1.30:4100.')
    expect(commandWords('suspend', { phase: 'idle' })).toBeNull()
  })
})

const host = (name: string, over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint: name, fingerprintShort: name, hostId: name, machineName: name, siteName: name, hqMachine: false, siteRegistered: true,
  connectedAt: NOW.toISOString(), online: true, since: null, leftByItself: false, leftAt: null, figures: null, figuresAt: null,
  agents: null, scheduled: [], move: null, ...over,
})

describe('what follows HQ when it moves @SC-913', () => {
  const hosts = [host('hq-box', { hqMachine: true }), host('office-server'), host('laptop', { online: false, since: '2026-10-13T18:02:00' })]

  it('to a new address: connected ones are told, offline ones need pointing', () => {
    const rows = whatFollows(hosts, 'http://192.168.1.30:4100', { machineName: 'hq-box', here: '127.0.0.1:4300' }, NOW)
    expect(rows.map(r => r.name)).toEqual(['hq-box · HQ and its site', 'office-server', 'laptop', 'The Fleet Console'])
    expect(rows[0].text).toBe('Set to the new address by the host service during the restore.')
    expect(rows[1].text).toMatch(/^Connected: HQ tells its site and its host service the new address before it stops/)
    expect(rows[2]).toMatchObject({ pill: 'Will need pointing' })
    expect(rows[2].text).toMatch(/^Offline since today 18:02: it will keep trying the old address/)
    expect(rows[3].text).toBe('It runs on hq-box, so it is restored with HQ. Fleet admins carry on at 127.0.0.1:4300 on the new machine.')
  })

  it('keeping its own domain: everyone reconnects to the same address', () => {
    const rows = whatFollows(hosts, null, { machineName: 'elsewhere', here: '127.0.0.1:4300' }, NOW)
    expect(rows[1].text).toMatch(/reconnect to the same address/)
    expect(rows[2].pill).toBeUndefined()
    expect(rows[3].text).toBe("It runs on elsewhere and stays put; it dials HQ's address like a site.")
  })
})

const move = (over: Partial<Move> = {}): Move => ({
  moveId: 'm1', kind: 'hq', from: 'hq-box', siteName: 'hq-box', executionSiteId: null, joinId: 'j1', to: 'new-server', transferId: 't',
  at: null, by: { userId: 'u1', name: 'Sam Rivera' }, confirmedBy: null, changeId: null, state: 'running',
  reports: { from: null, to: null }, problem: null, createdAt: NOW.toISOString(), ...over,
})

describe("HQ's move, step by step @SC-913", () => {
  const names = { from: 'hq-box', to: 'new-server' }
  it('moves on only on what the machines said', () => {
    const p = hqMoveProgress(move({ reports: { from: 'transferring', to: 'restoring' } }), names, 'http://192.168.1.30:4100', null, NOW)
    expect(p.title).toBe('Moving HQ to new-server')
    expect(p.stepOf).toBe('Step 3 of 5')
    expect(p.steps.map(s => s.state)).toEqual(['done', 'done', 'current', 'todo', 'todo'])
    expect(p.steps[3].detail).toMatch(/told http:\/\/192\.168\.1\.30:4100/)
  })
  it('ends moved, and says where the Fleet Console is when it came with HQ', () => {
    const p = hqMoveProgress(move({ state: 'done' }), names, null, '127.0.0.1:4300', NOW)
    expect(p.ended).toMatchObject({ tone: 'healthy', title: 'Moved.' })
    expect(p.ended!.text).toBe('HQ now runs on new-server, and hq-box has left the fleet. The Fleet Console came with it: open it at 127.0.0.1:4300 on new-server.')
  })
  it('a failed move says HQ stays where it was, in its own words when it has them', () => {
    expect(hqMoveProgress(move({ state: 'failed', problem: null }), names, null, null, NOW).ended!.text).toBe('HQ stays on hq-box.')
    expect(hqMoveProgress(move({ state: 'failed', problem: 'new-server did not answer.' }), names, null, null, NOW).ended!.text).toBe('new-server did not answer.')
  })
})
