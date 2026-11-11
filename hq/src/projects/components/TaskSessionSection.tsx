import { useShellPanels } from '../../shared/context/useShellPanels'
import { TaskSessionSection as LiftedTaskSessionSection } from '@agenthix/ui/sessions'
import { runWaitText, type RunWaitNote } from '@agenthix/ui/tasks'
import { heldTaskNotice, lostAccessRunNotice } from '../pages/taskHeldNotice'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'

interface TaskSessionSectionProps {
  task: {
    id: string
    projectId: string
    assignedAgentId: string | null
    runState: string
    runStateReason?: string | null
    /** Why a queued task has not started (automation/queueNotes.ts). */
    runWait?: RunWaitNote | null
  }
  taskSession: any | null
  onStart: () => void | Promise<void>
  onStop: () => void | Promise<void>
  onDismiss?: () => void | Promise<void>
  actionBusy: boolean
}

export function TaskSessionSection(props: TaskSessionSectionProps) {
  const { openRunsSession } = useShellPanels()
  const heldNotice = heldTaskNotice(props.task)
  const waitText = heldNotice ? null : runWaitText(props.task.runWait)
  const mayWork = useMayWork(props.task.projectId)
  return (
    <div>
      {heldNotice && (
        <div className="mb-3 px-3 py-2.5 rounded-lg border border-warning/20 bg-warning/10 text-small leading-relaxed text-warning">
          <p className="text-micro font-medium mb-1 opacity-70">Held</p>
          {heldNotice}
        </div>
      )}
      {waitText && (
        <p role="status" className="mb-3 px-3 py-2.5 rounded-lg border border-border bg-card text-small leading-relaxed text-text-secondary">
          {waitText}
        </p>
      )}
      <LiftedTaskSessionSection
        {...props}
        runUnavailableReason={lostAccessRunNotice(props.task) ?? undefined}
        readOnlyReason={mayWork ? undefined : VIEWER_CANNOT_WORK}
        onViewTranscript={openRunsSession}
      />
    </div>
  )
}
