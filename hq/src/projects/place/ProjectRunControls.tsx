import { useState } from 'react'
import { useAction, stopPlaceRuns } from 'wasp/client/operations'
import { Loader2, Square } from 'lucide-react'
import { BUTTON_SECONDARY, Tooltip, useRefusal, withoutHover, ConfirmDialog } from '@agenthix/ui/primitives'
import { useMayWork } from '../../shared/hooks/useMayWork'
import { ShowAttention, toast } from '@agenthix/ui/attention'

const BUTTON = `flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-small font-medium ${BUTTON_SECONDARY}`

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

const PROJECT_COPY = {
  stopLabel: 'Stop every run',
  stopAll: "Stop this project's running and waiting runs",
  confirmTitle: 'Stop every run in this project?',
  confirmText: "Every running task stops, waiting tasks go back to Not started, and your own conversations here stop answering. Other people's conversations are not stopped.",
}

// The personal space (Chat, spec §7) is the person's alone, so its wording names no one else.
const PERSONAL_COPY: typeof PROJECT_COPY = {
  stopLabel: 'Stop all',
  stopAll: "Stop your space's running and waiting runs",
  confirmTitle: 'Stop all runs in your space?',
  confirmText: 'Every running task in your space stops, waiting tasks go back to Not started, and your conversations in Chat stop answering.',
}

/**
 * Stop every run, at the top of the Runs tool (spec §3, N4): it stops the
 * project's running runs and takes its waiting ones out of line, after a
 * confirmation; it is the project admins' (spec §9), so others see it disabled
 * with the reason. A project Viewer is not offered it (adr-0102). Starting work
 * is an agent's Start in the Workroom (adr-0175).
 */
export function ProjectRunControls({ projectId, isProjectAdmin, personal = false }: { projectId: string; isProjectAdmin: boolean; personal?: boolean }) {
  const copy = personal ? PERSONAL_COPY : PROJECT_COPY
  const stop = useAction(stopPlaceRuns)
  const mayWork = useMayWork(projectId)
  const refused = useRefusal(!isProjectAdmin ? { reason: "Only this project's admins can stop all its runs", title: 'Stopping every run is for admins' } : undefined)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  const stopAll = async () => {
    setConfirming(false)
    setBusy(true)
    setMessage(null)
    try {
      const r = await stop({ projectId })
      toast(r.cancelled + r.withdrawn === 0
        ? 'Nothing was running'
        : `Stopped ${plural(r.cancelled, 'run', 'runs')}, took ${plural(r.withdrawn, 'waiting task', 'waiting tasks')} out of line`)
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Could not stop the runs', error: true })
    } finally {
      setBusy(false)
    }
  }

  if (!mayWork) return null

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-2">
        <Tooltip label={refused.tooltip ?? ''} side="top" wrap disabled={!refused.tooltip}>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy}
            title={refused.tooltip ? undefined : copy.stopAll}
            {...refused.props}
            className={`${refused.tooltip ? withoutHover(BUTTON) : BUTTON} text-danger!`}
          >
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Square size={13} aria-hidden />} {copy.stopLabel}
          </button>
        </Tooltip>
        {refused.dialog}
      </div>
      <ShowAttention kind="alert" text={message?.error ? message.text : null} title="The runs were not stopped" onClose={() => setMessage(null)} />
      <ConfirmDialog
        open={confirming}
        title={copy.confirmTitle}
        description={copy.confirmText}
        confirmLabel={copy.stopLabel}
        destructive
        onConfirm={() => void stopAll()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  )
}
