// @vitest-environment jsdom
/**
 * The live preview's strip (live preview spec part 4, *The app* and *Secrets*): a person stops and restarts an app,
 * sees what *Start with secrets* handed (names only) or why it did not, cannot press it again while it runs, and is
 * offered to restart the apps that started before the hand-off. A line about an app starting goes once it shows.
 */
import { withFeature } from '@agenthix/core/testing'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { LiveAppView, LivePreviewSecretsView, LivePreviewView } from '../../livePreviews/types'

const actions = vi.hoisted(() => ({} as Record<string, ReturnType<typeof vi.fn>>))
vi.mock('wasp/client/operations', () => ({
  useAction: (name: string) => (actions[name] ??= vi.fn().mockResolvedValue(undefined)),
  answerLivePreviewQuestion: 'answerLivePreviewQuestion', runLivePreviewWorkflow: 'runLivePreviewWorkflow',
  startLiveApp: 'startLiveApp', stopLiveApp: 'stopLiveApp', restartLiveApp: 'restartLiveApp',
}))

import { LivePreviewStrip } from '../components/LivePreviewStrip'

const site = { executionSiteId: 'es1', name: 'Mac', open: 1, limit: null }
const shop = (over: Partial<LiveAppView> = {}): LiveAppView => ({
  appId: 'a1', name: 'shop', folder: '', command: 'npm run dev', port: 3000, state: 'running', since: '2026-11-02T07:00:00.000Z',
  detail: null, lastLines: [], address: 'https://p-1.preview.example.com', ...over,
})
const view = (over: Partial<LivePreviewView> = {}): LivePreviewView => ({
  livePreviewId: 'lp1', workspaceId: 'w1', branchId: 'b1', branch: 'shop-7', onMain: false, state: 'running', reason: null,
  detail: null, since: '2026-11-02T06:59:00.000Z', site, startedBy: { id: 'u1', name: 'Mia' }, yours: true, mayStop: true,
  mayResume: false, autoReload: true, openedAt: '2026-11-02T06:59:00.000Z', lastUsedAt: '2026-11-02T06:59:00.000Z',
  apps: [shop()], startable: [], services: [], questions: [], workflows: { start: true, reload: false }, secrets: null, ...over,
})
const handed = (over: Partial<LivePreviewSecretsView> = {}): LivePreviewSecretsView => ({
  runId: 'r1', kind: 'start', state: 'passed', names: ['SHOP_API_KEY'], message: null, at: '2026-11-02T07:11:10.000Z', ...over,
})

function strip(v: LivePreviewView, canAct = true, onChanged = vi.fn()) {
  const tree = (x: LivePreviewView) => (
    <LivePreviewStrip view={x} chosen={x.apps.find(a => a.state !== 'stopped') ?? null} onChoose={vi.fn()} canAct={canAct} onChanged={onChanged} />
  )
  const r = render(tree(v))
  return { again: (x: LivePreviewView) => r.rerender(tree(x)), onChanged }
}

beforeEach(() => { for (const k of Object.keys(actions)) delete actions[k] })
afterEach(() => { cleanup(); vi.useRealTimers() })

withFeature('livePreview', () => {
describe('stopping and restarting an app from the strip @SC-1703', () => {
  it('stops and restarts the chosen app through HQ', async () => {
    strip(view())
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stop shop' })) })
    expect(actions.stopLiveApp).toHaveBeenCalledWith({ livePreviewId: 'lp1', appId: 'a1' })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Restart shop' })) })
    expect(actions.restartLiveApp).toHaveBeenCalledWith({ livePreviewId: 'lp1', appId: 'a1' })
  })

  it('offers a failed app Restart only, and a Viewer neither', () => {
    strip(view({ apps: [shop({ state: 'failed', detail: 'port in use' })] }))
    expect(screen.queryByRole('button', { name: 'Stop shop' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Restart shop' })).toBeTruthy()
    cleanup()
    strip(view(), false)
    expect(screen.queryByRole('button', { name: /Stop shop|Restart shop/ })).toBeNull()
  })

  it("shows no chip for an app of the branch that is not going here: Start offers it", () => {
    strip(view({
      apps: [shop({ appId: 'a9', name: 'web', state: 'stopped' })],
      startable: [{ name: 'web', folder: '', command: 'npm run dev', port: 3000, fromBranch: null }],
    }))
    expect(screen.queryByRole('button', { name: /web\s*· Stopped/ })).toBeNull()
    expect(screen.getByRole('button', { name: /Start\s*web/ })).toBeTruthy()
    expect(screen.getByText('No app is running yet. Start one:')).toBeTruthy()
  })
})
})

withFeature('livePreview', () => {
describe('"is starting" goes once the app shows @SC-1703', () => {
  it('keeps the line while the app starts, and drops it once it runs', async () => {
    actions.startLiveApp = vi.fn().mockResolvedValue({ appId: 'a1' })
    const v = view({ apps: [shop({ state: 'stopped' })], startable: [{ name: 'shop', folder: '', command: 'npm run dev', port: 3000, fromBranch: null }] })
    const { again } = strip(v)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Start\s*shop/ })) })
    expect(screen.getByText('shop is starting.')).toBeTruthy()
    again({ ...v, apps: [shop({ state: 'starting' })], startable: [] })
    expect(screen.getByText('shop is starting.')).toBeTruthy()
    again({ ...v, apps: [shop({ state: 'running' })], startable: [] })
    expect(screen.queryByText('shop is starting.')).toBeNull()
  })
})
})

withFeature('livePreview', () => {
describe('Start with secrets on the strip @SC-1712', () => {
  it('shows the run going, cannot be pressed again meanwhile, and reads HQ again until it ends', async () => {
    vi.useFakeTimers()
    const { onChanged } = strip(view({ secrets: handed({ state: 'going', names: [] }) }))
    expect(screen.getByTestId('live-preview-secrets').textContent).toContain('start-live-preview is running.')
    expect((screen.getByRole('button', { name: 'Start with secrets' }) as HTMLButtonElement).disabled).toBe(true)
    onChanged.mockClear()
    act(() => { vi.advanceTimersByTime(4_100) })
    expect(onChanged).toHaveBeenCalledTimes(2)
  })

  it('then names what it handed, and offers to restart the app that started before it', async () => {
    strip(view({ secrets: handed() }))
    const line = screen.getByTestId('live-preview-secrets')
    expect(line.textContent).toContain('handed SHOP_API_KEY to the app\'s container')
    expect(line.textContent).toContain('shop started before, so it has not read them.')
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: 'Restart shop' }).at(-1)!) })
    expect(actions.restartLiveApp).toHaveBeenCalledWith({ livePreviewId: 'lp1', appId: 'a1' })
    expect((screen.getByRole('button', { name: 'Start with secrets' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('offers no restart to an app started after the hand-off', () => {
    strip(view({ apps: [shop({ since: '2026-11-02T07:12:00.000Z' })], secrets: handed() }))
    expect(screen.getByTestId('live-preview-secrets').textContent).not.toContain('started before')
  })

  it('says why it failed', () => {
    strip(view({ secrets: handed({ state: 'failed', names: [], message: 'The run passed, but the live preview stopped or paused meanwhile, so its secrets were not handed to the app.' }) }))
    expect(screen.getByRole('alert').textContent).toMatch(/stopped or paused meanwhile/)
  })
})
})
