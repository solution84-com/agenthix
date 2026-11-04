import { describe, expect, it } from 'vitest'
import { LIVE_PREVIEW_METHODS, LIVE_PREVIEW_REFUSALS, LIVE_PREVIEW_STOPPERS, SITE_LIVE_PREVIEWS_METHOD } from '../livePreviews.js'
import { LIVE_PREVIEW_APP_METHODS } from '../livePreviewApps.js'
import {
  parseLivePreviewActParams, parseLivePreviewOpenParams, parseLivePreviewRefreshParams, parseLivePreviewResumeParams,
  parseLivePreviewStopParams, parseSiteLivePreviewsParams,
  parseLivePreviewAppListParams, parseLivePreviewAppStartParams, parseLivePreviewAppStopParams,
} from '../livePreviewParse.js'

const COPY = '0b6f3a52-1c1e-4c5a-9d43-2c2f7d3c9e10'
const BUNDLE = '1c7f3a52-1c1e-4c5a-9d43-2c2f7d3c9e10'
const HEAD = 'a'.repeat(40)
const workspace = { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' }
const open = {
  livePreviewId: 'lp1', projectId: 'p1', personId: 'u1', workspace, branch: 'add-login-page', onMain: false,
  copy: { kind: 'branch', copyId: COPY },
}

describe('live previews on the control channel @SC-1760', () => {
  it('names its methods apart from every other', () => {
    const names = [...Object.values(LIVE_PREVIEW_METHODS), ...Object.values(LIVE_PREVIEW_APP_METHODS), SITE_LIVE_PREVIEWS_METHOD]
    expect(new Set(names).size).toBe(names.length)
    for (const n of names) expect(n.startsWith('room.') || n.startsWith('siteRoom.')).toBe(false)
  })

  it("names the site's own refusals", () => {
    for (const code of ['turnedOff', 'atLimit', 'guardDown', 'branchOpen', 'noCopy']) expect(LIVE_PREVIEW_REFUSALS).toContain(code)
  })
})

describe('the params are read closed @SC-1760', () => {
  it("reads livePreview.open on a branch's copy, main's copy and a bundle's", () => {
    expect(parseLivePreviewOpenParams(open)).toEqual(open)
    const main = { ...open, branch: 'main', onMain: true, copy: { kind: 'main', copyId: COPY } }
    expect(parseLivePreviewOpenParams(main)).toEqual(main)
    const elsewhere = { ...open, projectId: null, copy: { kind: 'bundle', copyId: COPY, bundleId: BUNDLE } }
    expect(parseLivePreviewOpenParams(elsewhere)).toEqual(elsewhere)
  })

  it('refuses livePreview.open with a field missing, extra or not its shape', () => {
    expect(parseLivePreviewOpenParams({ ...open, extra: 1 })).toBeNull()
    const { copy: _c, ...missing } = open
    expect(parseLivePreviewOpenParams(missing)).toBeNull()
    expect(parseLivePreviewOpenParams({ ...open, branch: '-x' })).toBeNull()
    expect(parseLivePreviewOpenParams({ ...open, copy: { kind: 'branch', copyId: '../x' } })).toBeNull()
    expect(parseLivePreviewOpenParams({ ...open, copy: { kind: 'bundle', copyId: COPY } })).toBeNull()
    expect(parseLivePreviewOpenParams({ ...open, workspace: { ...workspace, ownerType: 'org' } })).toBeNull()
    expect(parseLivePreviewOpenParams({ ...open, workspace: { ...workspace, path: '/' } })).toBeNull()
    expect(parseLivePreviewOpenParams(null)).toBeNull()
  })

  it("never binds a branch's copy for main, nor main's copy for a branch", () => {
    expect(parseLivePreviewOpenParams({ ...open, onMain: true })).toBeNull()
    expect(parseLivePreviewOpenParams({ ...open, copy: { kind: 'main', copyId: COPY } })).toBeNull()
  })

  it('reads livePreview.resume and livePreview.stop', () => {
    expect(parseLivePreviewResumeParams({ livePreviewId: 'lp1', personId: 'u1' })).toEqual({ livePreviewId: 'lp1', personId: 'u1' })
    expect(parseLivePreviewResumeParams({ livePreviewId: 'lp1' })).toBeNull()
    for (const by of LIVE_PREVIEW_STOPPERS) expect(parseLivePreviewStopParams({ livePreviewId: 'lp1', by })).toEqual({ livePreviewId: 'lp1', by })
    expect(parseLivePreviewStopParams({ livePreviewId: 'lp1', by: 'guard' })).toBeNull()
  })

  it('reads livePreview.act for the kinds a person may ask', () => {
    const act = { livePreviewId: 'lp1', personId: 'u1', request: { kind: 'app.open', appId: 'a'.repeat(26), entry: 'tab' } }
    expect(parseLivePreviewActParams(act)).toEqual(act)
    expect(parseLivePreviewActParams({ ...act, request: { kind: 'file.read', path: 'a' } })).toBeNull()
  })

  it('reads livePreview.refresh', () => {
    expect(parseLivePreviewRefreshParams({ livePreviewId: 'lp1', head: HEAD, bundleId: null }))
      .toEqual({ livePreviewId: 'lp1', head: HEAD, bundleId: null })
    expect(parseLivePreviewRefreshParams({ livePreviewId: 'lp1', head: 'HEAD~1', bundleId: null })).toBeNull()
  })

  it('reads site.livePreviews', () => {
    const s = { allowed: true, limit: null, idleMinutes: 120 }
    expect(parseSiteLivePreviewsParams(s)).toEqual(s)
    expect(parseSiteLivePreviewsParams({ ...s, limit: 6 })).toEqual({ ...s, limit: 6 })
    for (const bad of [{ ...s, limit: 0 }, { ...s, idleMinutes: 0 }, { allowed: true, limit: null }, { ...s, more: 1 }, { ...s, allowed: 'yes' }]) {
      expect(parseSiteLivePreviewsParams(bad), JSON.stringify(bad)).toBeNull()
    }
  })
})

describe('the app methods\' params are read closed by core', () => {
  const app = { appId: 'abcdefghijklmnopqrstuvwxyz', name: 'web', folder: '', command: 'npm run dev', port: 5173 }
  const start = { livePreviewId: 'lp1', personId: 'u1', app, startedBy: { agentId: 'ag1', runId: 'r1' } }

  it('reads a start, with or without the run that asked', () => {
    expect(parseLivePreviewAppStartParams(start)).toEqual(start)
    expect(parseLivePreviewAppStartParams({ ...start, startedBy: null })).toEqual({ ...start, startedBy: null })
  })

  it('refuses an extra field, a missing one and a value not its shape', () => {
    for (const bad of [
      { ...start, extra: 1 }, { ...start, app: { ...app, port: '5173' } }, { ...start, app: { ...app, extra: 1 } },
      { ...start, startedBy: { agentId: 'ag1' } }, { ...start, startedBy: undefined }, { ...start, personId: '' }, null, [],
    ]) expect(parseLivePreviewAppStartParams(bad), JSON.stringify(bad)).toBeNull()
  })

  it('reads a stop and a list, and refuses anything else', () => {
    const stop = { livePreviewId: 'lp1', personId: 'u1', appId: 'abcdefghijklmnopqrstuvwxyz' }
    expect(parseLivePreviewAppStopParams(stop)).toEqual(stop)
    expect(parseLivePreviewAppStopParams({ ...stop, appId: 'x'.repeat(200) })).toBeNull()
    expect(parseLivePreviewAppStopParams({ ...stop, extra: 1 })).toBeNull()
    expect(parseLivePreviewAppListParams({ livePreviewId: 'lp1' })).toEqual({ livePreviewId: 'lp1' })
    expect(parseLivePreviewAppListParams({ livePreviewId: 'lp1', extra: 1 })).toBeNull()
  })
})
