import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { useAction, answerLivePreviewQuestion, runLivePreviewWorkflow, startLiveApp } from 'wasp/client/operations'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import type { LiveAppView, LivePreviewQuestion, LivePreviewView } from '../../livePreviews/types'
import { APP_STATE_LABEL, SERVICE_STATE_LABEL, appLine, noAppLine, refusalOf, startableTitle } from '../livePreviewWords'

const CHIP = 'flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-micro'

/**
 * Under the bar (spec part 4, *The app*, *Secrets*): the live preview's apps, to choose which shows in the middle;
 * *Start* for each app known on the workspace that is not going here, as it was last started, for a person who may
 * work here (`main`'s live preview included); its services with their state; and what waits for a person's yes, a new or changed service or a blocked install script,
 * worded by HQ. *Start* and *Reload* through the place's approved workflows hand the app the secrets they name, each
 * shown only when the place has that workflow approved and switched on.
 */
export function LivePreviewStrip({ view, chosen, onChoose, canAct, onChanged }: {
  view: LivePreviewView
  chosen: LiveAppView | null
  onChoose: (appId: string) => void
  canAct: boolean
  onChanged: () => void
}) {
  const answer = useAction(answerLivePreviewQuestion)
  const runWorkflow = useAction(runLivePreviewWorkflow)
  const startApp = useAction(startLiveApp)
  const [busy, setBusy] = useState(false)
  const [told, setTold] = useState<{ text: string; alert: boolean } | null>(null)
  const running = view.state === 'running'

  const act = async (work: () => Promise<unknown>, done: string, failed: string) => {
    setBusy(true)
    setTold(null)
    try {
      await work()
      setTold({ text: done, alert: false })
    } catch (err) {
      setTold({ text: refusalOf(err, failed), alert: true })
    } finally {
      setBusy(false)
      onChanged()
    }
  }
  const yes = (q: LivePreviewQuestion) => act(
    () => answer({
      livePreviewId: view.livePreviewId,
      request: q.kind === 'service.start'
        ? { kind: 'service.start', service: q.service, declaration: q.declaration }
        : { kind: 'package.use', ecosystem: q.ecosystem, name: q.name, version: q.version },
    }),
    q.kind === 'service.start' ? `${q.service} is starting.` : `${q.name} may run its install script. The agent has been told.`,
    'Your answer was not sent.',
  )
  const workflow = (kind: 'start' | 'reload') => act(
    () => runWorkflow({ livePreviewId: view.livePreviewId, kind }),
    kind === 'start' ? 'The start workflow is running. Its secrets go to the app only.' : 'The reload workflow is running. Its secrets go to the app only.',
    'The workflow did not run.',
  )

  const start = (name: string) => act(
    async () => {
      const { appId } = await startApp({ livePreviewId: view.livePreviewId, name })
      onChoose(appId)
    },
    `${name} is starting.`,
    `${name} did not start.`,
  )
  const startable = canAct && running ? view.startable : []

  const failed = chosen?.state === 'failed' ? chosen : null
  return (
    <div className="shrink-0 border-b border-border-subtle bg-surface-1" data-testid="live-preview-strip">
      <div className="flex items-center gap-2 overflow-x-auto px-2.5 py-1.5">
        {view.apps.length === 0 && <span className="shrink-0 text-micro text-text-muted">{noAppLine(view.onMain, startable.length > 0)}</span>}
        {view.apps.map(a => (
          <button key={a.appId} type="button" aria-pressed={chosen?.appId === a.appId} onClick={() => onChoose(a.appId)} title={appLine(a)}
            className={`${CHIP} ${chosen?.appId === a.appId ? 'border-accent bg-accent-subtle text-text-primary' : 'border-border-subtle text-text-secondary hover:bg-surface-hover'}`}>
            <span className="font-medium">{a.name}</span><span className="text-text-muted">· {APP_STATE_LABEL[a.state]}</span>
          </button>
        ))}
        {startable.map(a => (
          <button key={`start:${a.name}`} type="button" disabled={busy} onClick={() => void start(a.name)} title={startableTitle(a)}
            className={`${CHIP} border-dashed border-border-subtle text-text-secondary hover:bg-surface-hover`}>
            <span className="text-text-muted">Start</span><span className="font-medium">{a.name}</span>
          </button>
        ))}
        {view.services.map(s => (
          <span key={s.name} className={`${CHIP} border-border-subtle text-text-secondary`} data-testid="live-preview-service" title={s.detail ?? undefined}>
            {s.name}<span className="text-text-muted">· {SERVICE_STATE_LABEL[s.state]}</span>
          </span>
        ))}
        {canAct && running && (view.workflows.start || view.workflows.reload) && (
          <span className="ml-auto flex shrink-0 items-center gap-1" aria-label="With secrets">
            <KeyRound size={13} aria-hidden className="text-text-muted" />
            {view.workflows.start && <button type="button" className={FILES_BUTTON} disabled={busy} onClick={() => void workflow('start')}>Start with secrets</button>}
            {view.workflows.reload && <button type="button" className={FILES_BUTTON} disabled={busy} onClick={() => void workflow('reload')}>Reload with secrets</button>}
          </span>
        )}
      </div>
      {failed && (
        <div className="px-3 pb-2 text-small text-text-secondary">
          <p role="status">{appLine(failed)}</p>
          {failed.lastLines.length > 0 && <pre className="mt-1 max-h-28 overflow-auto rounded-lg bg-surface-2 p-2 font-mono text-micro">{failed.lastLines.join('\n')}</pre>}
        </div>
      )}
      {view.questions.length > 0 && (
        <section aria-label="Waiting for your yes" className="space-y-2 border-t border-border-subtle bg-surface-2 px-3 py-2">
          {view.questions.map(q => (
            <div key={q.kind === 'service.start' ? `s:${q.service}:${q.declaration}` : `p:${q.ecosystem}:${q.name}@${q.version}`}
              role="alert" className="flex flex-wrap items-center gap-2 text-small text-text-primary">
              <p className="min-w-0 flex-1">{q.question}</p>
              <button type="button" className={FILES_BUTTON_PRIMARY} disabled={busy || !canAct} onClick={() => void yes(q)}>
                {q.kind === 'service.start' ? 'Start it' : 'Allow'}
              </button>
            </div>
          ))}
          <p className="text-micro text-text-muted">Leaving it unanswered changes nothing: the agent carries on without it.</p>
        </section>
      )}
      {told && <p role={told.alert ? 'alert' : 'status'} className={`px-3 pb-2 text-small ${told.alert ? 'text-danger' : 'text-text-secondary'}`}>{told.text}</p>}
    </div>
  )
}
