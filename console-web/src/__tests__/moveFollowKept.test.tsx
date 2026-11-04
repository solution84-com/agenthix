import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetCsrfToken } from '../api/csrf'
import type { FleetHost } from '../pages/dashboard/types'
import type { Move } from '../pages/site/move/moveWords'
import { forgetStartedMoves } from '../forms/MoveChange'
import { fakeServer, fleetRoute } from './fakeServer'
import { openAt } from './maintenanceHarness'

const FP = 'a'.repeat(64)
const TO = 'b'.repeat(64)
const host = (over: Partial<FleetHost> = {}): FleetHost => ({
  fingerprint: FP, fingerprintShort: 'aaaa', hostId: 'h', machineName: 'office-server', siteName: 'office', hqMachine: false,
  siteRegistered: true, connectedAt: new Date().toISOString(), online: true, since: null, leftByItself: false, leftAt: null,
  figures: null, figuresAt: null, agents: null, scheduled: [], move: null, ...over,
})
const running: Move = {
  moveId: 'm1', from: FP, siteName: 'office', executionSiteId: 's1', joinId: 'j1', to: TO, transferId: null, at: null,
  by: { userId: 'u1', name: 'Sam Rivera' }, confirmedBy: { userId: 'u1', name: 'Sam Rivera' }, changeId: null, state: 'running',
  reports: { from: 'transferring', to: 'restoring' }, problem: null, createdAt: new Date().toISOString(),
}

beforeEach(() => { sessionStorage.setItem('csrfToken', 'tok') })
afterEach(() => { cleanup(); forgetStartedMoves(); vi.unstubAllGlobals(); forgetCsrfToken(); sessionStorage.clear(); window.history.replaceState(null, '', '/') })

describe('following a move after the old machine has left the fleet', () => {
  it('keeps following it and shows its outcome', async () => {
    let left = false
    let finished = false
    fakeServer({
      'GET /fleet': () => fleetRoute(left ? [] : [host({ move: { moveId: 'm1', role: 'sending', siteName: 'office', state: 'running', at: null } })]),
      [`GET /hosts/${TO}`]: { status: 200, body: { host: host({ fingerprint: TO, machineName: 'new-server' }) } },
      'GET /moves/m1': () => ({ status: 200, body: { move: finished ? { ...running, state: 'done', reports: { from: 'removed', to: 'tookOver' } } : running } }),
    })
    openAt(`/sites/${FP}/move`, 5)
    expect(await screen.findByText('Restored on new-server')).toBeTruthy()
    left = true
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    await act(async () => { await new Promise(r => setTimeout(r, 30)) })
    expect(window.location.pathname).toBe(`/sites/${FP}/move`)
    finished = true
    expect(await screen.findByText('Moved.')).toBeTruthy()
  })
})
