/** The pure rules of live previews: picking a site, a summary as a row, what the agent may give as an app. */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../sites/channel', () => ({ siteChannelRegistry: { isOnline: () => true }, ChannelRequestFailed: class extends Error {} }))
vi.mock('../../relays', () => ({ appAddress: () => null, appTickets: { revoke: vi.fn() } }))

import { hasRoom, pickSite, settingOf, type SiteChoice } from '../sites'
import { moveFromSummary } from '../store'
import { readToolSpec } from '../appTools'
import { refusalWords, stoppedDetail } from '../words'
import type { LivePreviewSummary } from '@agenthix/core'

const choice = (o: Partial<SiteChoice>): SiteChoice => ({
  executionSiteId: 'x', siteId: 'x', name: 'x', open: 0, limit: null, blocked: null, isWorkspaceSite: false, ...o,
})

describe('picking a site @SC-1713', () => {
  it("takes the workspace's own site when it may and has room", () => {
    const own = choice({ executionSiteId: 'own', isWorkspaceSite: true, open: 2, limit: 6 })
    expect(pickSite([own, choice({ executionSiteId: 'big' })])).toBe(own)
  })

  it('takes the allowed site with the most room when the own one is full or blocked', () => {
    const own = choice({ executionSiteId: 'own', isWorkspaceSite: true, open: 6, limit: 6 })
    const small = choice({ executionSiteId: 'small', open: 3, limit: 4 })
    const roomy = choice({ executionSiteId: 'roomy', open: 1, limit: 8 })
    expect(pickSite([own, small, roomy])?.executionSiteId).toBe('roomy')
    expect(pickSite([choice({ isWorkspaceSite: true, blocked: 'down' }), small])?.executionSiteId).toBe('small')
  })

  it('picks none when no site has room', () => {
    expect(pickSite([choice({ open: 1, limit: 1 })])).toBeNull()
    expect(hasRoom({ open: 64, limit: null })).toBe(true)
  })

  it('reads a limit or idle time that is not one as the default', () => {
    expect(settingOf({ livePreviewsAllowed: true, livePreviewLimit: 0, livePreviewIdleMinutes: 1 })).toEqual({ allowed: true, limit: null, idleMinutes: 120 })
  })
})

describe('a summary as a row @SC-1713', () => {
  const base: LivePreviewSummary = {
    livePreviewId: 'lp', projectId: 'p', personId: 'u', workspaceId: 'w', branch: 'b', onMain: false,
    copy: { kind: 'branch', copyId: 'c' }, head: 'a'.repeat(40), openedAt: new Date().toISOString(),
    state: { state: 'running', since: '2026-11-02T10:00:00.000Z' },
  }

  it('keeps hq\'s own sentence for a stop, never the site\'s', () => {
    const s = { ...base, state: { state: 'stopped' as const, since: base.state.since, reason: 'idle' as const, signal: null, detail: 'site words' } }
    const move = moveFromSummary(s, () => 'hq words')
    expect(move).toMatchObject({ state: 'STOPPED', reason: 'idle', detail: 'hq words', headCommit: base.head })
    expect(move.stoppedAt).toEqual(new Date(base.state.since))
  })

  it("keeps hq's clock for a time that does not read", () => {
    const move = moveFromSummary({ ...base, state: { state: 'running', since: 'never' } }, () => null)
    expect(move.state).toBe('RUNNING')
    expect((move.since as Date).getTime()).toBeGreaterThan(Date.now() - 5000)
  })
})

describe('what the agent gives as an app @SC-1760', () => {
  it('takes a port as text or a number, and a folder with its slashes trimmed', () => {
    expect(readToolSpec({ name: 'web', folder: './web/', command: 'npm run dev', port: '5173' })).toEqual({ name: 'web', folder: 'web', command: 'npm run dev', port: 5173 })
    expect(readToolSpec({ name: 'web', folder: '.', command: 'x', port: 8080 }).folder).toBe('')
  })

  it('refuses what is not a spec, saying what to give', () => {
    expect(() => readToolSpec({ name: 'Web App', folder: '', command: 'x', port: '80' })).toThrow(/lower-case/)
    expect(() => readToolSpec({ name: 'web', folder: '../up', command: 'x', port: '3000' })).toThrow(/inside your working folder/)
    expect(() => readToolSpec({ name: 'web', folder: '', command: 'x', port: '80' })).toThrow(/port/)
  })
})

describe('words @SC-1713', () => {
  it('ends every refusal with what was changed', () => {
    for (const code of ['turnedOff', 'atLimit', 'guardDown', 'noCopy', 'branchOpen'] as const) {
      expect(refusalWords({ code, message: 'ignored' }, 'preview-box', 'login')).toMatch(/Nothing was changed\.$/)
    }
    expect(refusalWords({ code: 'turnedOff', message: 'site words' }, 'preview-box', 'login')).not.toContain('site words')
  })

  it('says why a live preview stopped', () => {
    expect(stoppedDetail('resources', 'preview-box')).toContain('ran out of memory')
  })
})
