import { ExternalLink, Globe, Pause, Play, RotateCw, Square } from 'lucide-react'
import type { LivePreviewStateName } from '@agenthix/core'
import { FILES_BUTTON } from '@agenthix/ui/projects'
import type { LiveAppView, LivePreviewView } from '../../livePreviews/types'
import { PREVIEW_STATE_LABEL, PREVIEW_VIEWER_REASON, STARTED_BY, shownAddress, siteLoad } from '../livePreviewWords'

const TONE: Record<LivePreviewStateName, string> = {
  running: 'bg-success/10 text-success', starting: 'bg-surface-2 text-text-secondary', paused: 'bg-warning/10 text-warning', stopped: 'bg-surface-2 text-text-muted',
}
const DOT: Record<LivePreviewStateName, string> = {
  running: 'bg-success', starting: 'bg-text-muted', paused: 'bg-warning', stopped: 'bg-text-muted',
}

export function PreviewStatePill({ state }: { state: LivePreviewStateName }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium ${TONE[state]}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[state]}`} /> {PREVIEW_STATE_LABEL[state]}
    </span>
  )
}

const ICON = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover disabled:opacity-40'

/**
 * The live preview's own bar (spec part 4, *What stays fixed on screen*): it stays at the top of its area and never
 * scrolls away. Its state, *Reload*, the app's address, *New tab*, *Auto*, the site it runs on with how full it is,
 * who started it, and *Stop* (or *Resume* after a guard pause). On a phone it keeps the state and the address only.
 */
export function LivePreviewBar({ view, app, canAct, compact, busy, onReload, onNewTab, onAuto, onStop, onResume }: {
  view: LivePreviewView
  app: LiveAppView | null
  canAct: boolean
  compact: boolean
  busy: boolean
  onReload: () => void
  onNewTab: () => void
  onAuto: (auto: boolean) => void
  onStop: () => void
  onResume: () => void
}) {
  const running = view.state === 'running'
  const appOpen = running && app?.state === 'running' && !!app.address
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-1 px-2.5" data-testid="live-preview-bar">
      <PreviewStatePill state={view.state} />
      {!compact && (
        <button type="button" className={ICON} aria-label="Reload" title={canAct ? 'Reload' : PREVIEW_VIEWER_REASON} disabled={!canAct || !appOpen || busy} onClick={onReload}>
          <RotateCw size={15} aria-hidden />
        </button>
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-0 px-2.5 py-1">
        <Globe size={13} aria-hidden className="shrink-0 text-text-muted" />
        <span className="truncate font-mono text-micro text-text-secondary" data-testid="live-preview-address">
          {app ? shownAddress(app.address) : 'No app running yet'}
        </span>
      </div>
      {!compact && (
        <>
          <button type="button" className={FILES_BUTTON} disabled={!appOpen} onClick={onNewTab}><ExternalLink size={13} aria-hidden /> New tab</button>
          <label className="flex shrink-0 items-center gap-1 text-micro text-text-secondary" title="Reload by itself when the agent saves">
            <input type="checkbox" checked={view.autoReload} disabled={!canAct || busy || !running} onChange={e => onAuto(e.target.checked)} /> Auto
          </label>
          <span className="shrink-0 text-micro text-text-muted" data-testid="live-preview-site" title={STARTED_BY(view.startedBy.name, view.yours)}>{siteLoad(view.site)}</span>
          <span className="hidden shrink-0 text-micro text-text-muted xl:inline">{STARTED_BY(view.startedBy.name, view.yours)}</span>
          {view.mayResume && (
            <button type="button" className={FILES_BUTTON} disabled={busy} onClick={onResume}><Play size={13} aria-hidden /> Resume</button>
          )}
          {view.mayStop && (
            <button type="button" className={FILES_BUTTON} disabled={busy} title="Stop the live preview" onClick={onStop}>
              {view.state === 'paused' ? <Pause size={13} aria-hidden /> : <Square size={13} aria-hidden />} Stop
            </button>
          )}
        </>
      )}
    </div>
  )
}
