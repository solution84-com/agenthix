import { useState } from 'react'
import { useAction, runProject, stopPlaceRuns } from 'wasp/client/operations'
import { Loader2, Play, Square } from 'lucide-react'
import { ConfirmDialog } from '../../shared/components/ConfirmDialog'
import { useMayWork } from '../../shared/hooks/useMayWork'

const BUTTON = 'flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border-subtle px-2 py-1.5 text-small font-medium transition-colors disabled:opacity-50'

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

const PROJECT_COPY = {
  runAll: 'Start every queued task in this project',
  stopAll: "Stop this project's running and queued runs",
  confirmTitle: 'Stop all runs in this project?',
  confirmText: "Every running task stops, queued tasks are taken out of the queue, and your own conversations here stop answering. Other people's conversations are not stopped.",
}

// The personal space (Chat, spec §7) is the person's alone, so its wording names no one else.
const PERSONAL_COPY: typeof PROJECT_COPY = {
  runAll: 'Start every queued task in your space',
  stopAll: "Stop your space's running and queued runs",
  confirmTitle: 'Stop all runs in your space?',
  confirmText: 'Every running task in your space stops, queued tasks are taken out of the queue, and your conversations in Chat stop answering.',
}

/**
 * Run all and Stop all, under the tools panel's "Agents at work" (spec §3). Run
 * all queues every queued task in the project, as the Overview's did. Stop all
 * stops the project's running and queued runs, after a confirmation; it is the
 * project admins' (spec §9), so others see it disabled with the reason. A
 * project Viewer is offered neither (adr-0102).
 */
export function ProjectRunControls({ projectId, isProjectAdmin, personal = false }: { projectId: string; isProjectAdmin: boolean; personal?: boolean }) {
  const copy = personal ? PERSONAL_COPY : PROJECT_COPY
  const run = useAction(runProject)
  const stop = useAction(stopPlaceRuns)
  const mayWork = useMayWork(projectId)
  const stopRefusal = !isProjectAdmin ? "Only this project's admins can stop all its runs" : null
  const [busy, setBusy] = useState<'run' | 'stop' | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const runAll = async () => {
    setBusy('run')
    setMessage(null)
    try {
      const r = await run({ projectId })
      setMessage({ text: r.dispatched > 0 ? `Started ${plural(r.dispatched, 'task', 'tasks')}` : 'No queued tasks to run' })
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not run the queued tasks', error: true })
    } finally {
      setBusy(null)
    }
  }

  const stopAll = async () => {
    setConfirming(false)
    setBusy('stop')
    setMessage(null)
    try {
      const r = await stop({ projectId })
      setMessage({
        text: r.cancelled + r.withdrawn === 0
          ? 'Nothing was running'
          : `Stopped ${plural(r.cancelled, 'run', 'runs')}, withdrew ${plural(r.withdrawn, 'queued task', 'queued tasks')}`,
      })
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not stop the runs', error: true })
    } finally {
      setBusy(null)
    }
  }

  if (!mayWork) return null

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void runAll()}
          disabled={busy !== null}
          title={copy.runAll}
          className={`${BUTTON} text-text-secondary hover:bg-surface-hover hover:text-text-primary`}
        >
          {busy === 'run' ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Play size={13} aria-hidden />} Run all
        </button>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy !== null || stopRefusal !== null}
          title={stopRefusal ?? copy.stopAll}
          className={`${BUTTON} text-danger hover:bg-danger/10`}
        >
          {busy === 'stop' ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Square size={13} aria-hidden />} Stop all
        </button>
      </div>
      {message && (
        <p role={message.error ? 'alert' : 'status'} className={`text-small ${message.error ? 'text-danger' : 'text-text-muted'}`}>{message.text}</p>
      )}
      <ConfirmDialog
        open={confirming}
        title={copy.confirmTitle}
        description={copy.confirmText}
        confirmLabel="Stop all"
        destructive
        onConfirm={() => void stopAll()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
