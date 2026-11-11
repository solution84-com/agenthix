import { useEffect, useState } from 'react'
import { useAction, reloadLivePreview, resumeLivePreview, setLivePreviewAuto, stopLivePreview } from 'wasp/client/operations'
import { FilesQuietLine } from '@agenthix/ui/projects'
import type { LivePreviewView } from '../../livePreviews/types'
import type { LivePreviewModel } from '../hooks/useLivePreview'
import { useWorkspaceViewEvent } from '../hooks/useWorkspaceLive'
import { refusalOf, waitingWords } from '../livePreviewWords'
import { LiveAppFrame, useOpenInTab } from './LiveAppFrame'
import { LivePreviewBar } from './LivePreviewBar'
import { LivePreviewStart } from './LivePreviewStart'
import { LivePreviewStrip } from './LivePreviewStrip'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * *Live preview* in the middle (spec part 4): before one runs, where it would start; once it runs, its own bar fixed at
 * the top, the strip of apps, services and questions, and the chosen app in a frame. A reload asked by the agent or a
 * person, or commits on the branch with *Auto* on, enter the frame again for everyone who has it open.
 */
export function LivePreviewMiddle({ workspaceId, branchId, branchName, model, canAct, layout }: {
  workspaceId: string
  branchId: string | null
  branchName: string
  model: LivePreviewModel
  canAct: boolean
  layout: 'wide' | 'narrow'
}) {
  const { places, view, refetch } = model
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [started, setStarted] = useState<{ view: LivePreviewView; at: number } | null>(null)
  const reload = useAction(reloadLivePreview)
  const stop = useAction(stopLivePreview)
  const resume = useAction(resumeLivePreview)
  const setAuto = useAction(setLivePreviewAuto)
  // What starting answered bridges only until HQ is read again: from then on the bar follows HQ's state, so a live
  // preview that stopped meanwhile never stays on Starting.
  const bridge = started && started.view.branchId === branchId && model.placesReadAt <= started.at ? started.view : null
  const shown = view ?? bridge
  const openInTab = useOpenInTab(shown?.livePreviewId ?? null)

  useEffect(() => { setChosenId(null); setProblem(null); setStarted(null) }, [branchId])

  useWorkspaceViewEvent(e => {
    if (!shown) return
    if (e.kind === 'reload' && e.event.livePreviewId === shown.livePreviewId) {
      if (e.event.kind === 'reload') setReloads(n => n + 1)
      else refetch()
    }
    if (e.kind === 'commits' && shown.autoReload && e.branchId === shown.branchId) setReloads(n => n + 1)
  })

  if (!places && !shown) {
    return model.error ? <ShowAttention text={model.error.message} title="The live previews could not be read" retry={refetch} /> : <FilesQuietLine>Loading…</FilesQuietLine>
  }
  if (!shown || shown.state === 'stopped') {
    if (!places) return <FilesQuietLine>Loading…</FilesQuietLine>
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <LivePreviewStart workspaceId={workspaceId} branchId={branchId} branchName={branchName} places={places} stopped={shown}
          onStarted={v => { setStarted({ view: v, at: Date.now() }); refetch() }} onChanged={refetch} />
      </div>
    )
  }

  const running = shown.apps.filter(a => a.state === 'running')
  const app = shown.apps.find(a => a.appId === chosenId) ?? running[0] ?? shown.apps.find(a => a.state !== 'stopped') ?? null
  const act = async (work: () => Promise<unknown>, failed: string) => {
    setBusy(true)
    setProblem(null)
    try { await work() } catch (err) { setProblem(refusalOf(err, failed)) } finally { setBusy(false); refetch() }
  }
  const compact = layout === 'narrow'
  const id = shown.livePreviewId

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="live-preview">
      <LivePreviewBar view={shown} app={app} canAct={canAct} compact={compact} busy={busy}
        onReload={() => void act(() => reload({ livePreviewId: id }), 'It was not reloaded.')}
        onNewTab={() => { if (app) openInTab(app.appId).catch(err => setProblem(refusalOf(err, 'The app could not be opened.'))) }}
        onAuto={auto => void act(() => setAuto({ livePreviewId: id, auto }), '*Auto* was not changed.')}
        onStop={() => void act(() => stop({ livePreviewId: id }), 'It was not stopped.')}
        onResume={() => void act(() => resume({ livePreviewId: id }), 'It was not resumed.')} />
      {!compact && <LivePreviewStrip view={shown} chosen={app} onChoose={setChosenId} canAct={canAct} onChanged={refetch} />}
      {problem && <ShowAttention text={problem} />}
      {shown.state === 'running' && app?.state === 'running' && app.address ? (
        <LiveAppFrame key={`${id}:${app.appId}`} livePreviewId={id} app={app} reloads={reloads} onProblem={setProblem} />
      ) : (
        <FilesQuietLine role="status">{waitingWords(shown, app?.state === 'stopped' ? null : app, canAct)}</FilesQuietLine>
      )}
    </div>
  )
}
