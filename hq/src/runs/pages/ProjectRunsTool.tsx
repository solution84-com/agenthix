import { useNavigate, useSearchParams } from 'react-router'
import { Button } from '@agenthix/ui/primitives'
import { usePlaceCrumb } from '../../places/placeCrumb'
import { usePhoneActions } from '../../shared/layouts/phoneActions'
import { RunHistory } from '../components/RunHistory'
import { RunView } from '../components/RunView'
import { useRunLabel } from '../components/runLabel'

const SUBTITLE = 'Every run in this project, newest first: task runs, routine runs and replies in conversations, with what each cost.'

/**
 * A project's Runs (spec D19, the Runs design): its history, every run finished or not, and one run opened inside the
 * section (`?tool=runs&run=<run>&session=<its session>`), the section's crumb then the way back. What is happening now is
 * the Workroom, so *Open the Workroom ›* is the only button, outlined; a personal project has no Workroom.
 */
export function ProjectRunsTool({ projectKey, personal = false }: { projectKey: string; personal?: boolean }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const runId = params.get('run')
  const sessionId = params.get('session')
  const crumb = useRunLabel(runId, sessionId)?.crumb ?? null
  const inPlace = usePlaceCrumb(crumb)
  const workroom = `/projects/${encodeURIComponent(projectKey)}?tool=workroom`
  const onPhone = usePhoneActions(!runId && !personal ? [{ label: 'Open the Workroom ›', onSelect: () => navigate(workroom) }] : null)

  const openRun = (run: { runId: string; sessionId: string }) => setParams(p => {
    const q = new URLSearchParams(p)
    q.set('run', run.runId)
    q.set('session', run.sessionId)
    return q
  })

  if (runId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 max-lg:px-3">
        {!inPlace && (
          <button type="button" onClick={() => setParams(p => { const q = new URLSearchParams(p); q.delete('run'); q.delete('session'); return q })} className="self-start pt-3 text-small text-accent hover:underline">
            ‹ Runs
          </button>
        )}
        <RunView runId={runId} sessionId={sessionId} runHref={n => `/projects/${encodeURIComponent(projectKey)}?tool=runs&run=${encodeURIComponent(n.runId)}&session=${encodeURIComponent(n.sessionId)}`} />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="px-6 pb-6 pt-4 max-lg:px-3 max-lg:pt-0">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 max-lg:hidden">
            <h2 className="text-h2 font-semibold text-text-primary">Runs</h2>
            <p className="min-h-[1lh] text-small text-text-muted">{SUBTITLE}</p>
          </div>
          {!personal && (
            <div className={`flex shrink-0 items-center gap-2 ${onPhone ? 'max-lg:hidden' : ''}`}>
              <Button variant="secondary" onClick={() => navigate(workroom)}>Open the Workroom ›</Button>
            </div>
          )}
        </div>
        <RunHistory projectKey={projectKey} onOpenRun={openRun} onOpenTarget={href => navigate(href)} />
      </div>
    </div>
  )
}
