import { runWaitText, runNeedsPerson, type RunWaitNote } from '@agenthix/ui/tasks'
import { MANIFEST_BLOCKED_REASON } from '../../agents/taskExecutionReasons'
import { heldTaskNotice } from '../pages/taskHeldNotice'
import type { StopNotice } from '../pages/taskStopNotice'

interface NoticeTask {
  runState: string
  runStateReason?: string | null
  runWait?: RunWaitNote | null
}

const BOX = 'rounded-lg border px-3 py-2.5 text-small leading-relaxed'

/** What a person should know about a task's run: held, waiting its turn, why it failed or stopped, what Stop did. */
export function TaskNotices({ task, stopNotice }: { task: NoticeTask; stopNotice?: StopNotice | null }) {
  const held = heldTaskNotice(task)
  const wait = held ? null : runWaitText(task.runWait)
  const stopped = runNeedsPerson(task.runState) && task.runStateReason && task.runStateReason !== MANIFEST_BLOCKED_REASON
    ? task.runStateReason : null
  if (!held && !wait && !stopped && !stopNotice) return null
  return (
    <div className="space-y-2">
      {held && <p role="status" className={`${BOX} border-warning/20 bg-warning/10 text-warning`}>{held}</p>}
      {wait && <p role="status" className={`${BOX} border-border bg-surface-1 text-text-secondary`}>{wait}</p>}
      {stopped && (
        <p role="status" className={`${BOX} ${task.runState === 'RUN_FAILED' ? 'border-danger/20 bg-danger/10 text-danger' : 'border-warning/20 bg-warning/10 text-warning'}`}>
          {stopped}
        </p>
      )}
      {stopNotice && (
        <p
          role={stopNotice.kind === 'error' ? 'alert' : 'status'}
          className={`${BOX} ${stopNotice.kind === 'error' ? 'border-danger/20 bg-danger/10 text-danger' : 'border-border bg-surface-1 text-text-secondary'}`}
        >
          {stopNotice.text}
        </p>
      )}
    </div>
  )
}
