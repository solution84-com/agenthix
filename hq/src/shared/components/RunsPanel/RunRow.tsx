import { useState, type ReactNode } from 'react'
import { useAction, stopTaskSession, stopTask } from 'wasp/client/operations'
import { PanelItem, PanelItemAction } from '@agenthix/ui/primitives'
import { AgentAvatar } from '../SessionComponents'
import { useAgentImageUrl } from '../../hooks/useAgentImageUrl'
import { useMayWorkWhere } from '../../hooks/useMayWork'
import type { MyRun } from '../../../runs/queries'
import { runPlace, runState } from './runsListLogic'
import { useApproveNow } from '../NotificationPanel/useApproveNow'
import { forText, whenText } from './panelTime'

/**
 * One run in two lines (spec §6): the task or conversation with its key; then
 * the agent, place and state, and who started it when it was not the viewer.
 * At the right, the time and one button: Approve on a run waiting on a tool
 * request (it approves there and then), Stop on one going, Cancel on one queued. A click opens its task or
 * conversation.
 */
export function RunRow({ run, onOpen, onOpenRequest }: {
  run: MyRun
  onOpen: (run: MyRun) => void
  onOpenRequest?: (taskKey: string) => void
}) {
  const { approve, approving } = useApproveNow()
  const stopRun = useAction(stopTaskSession)
  const cancelRun = useAction(stopTask)
  // A run in a task of a project the person only reads offers nothing to do (adr-0102); their own conversation is theirs.
  const mayWork = useMayWorkWhere('key')
  const mayAct = !run.task || mayWork(run.place.projectKey)
  const [busy, setBusy] = useState(false)
  const avatarUrl = useAgentImageUrl(run.agent?.avatarUrl)

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  const state = runState(run)
  const detail = (
    <>
      {runPlace(run)}
      {state && <> · <span className={run.group === 'waiting' ? 'text-warning' : undefined}>{state}</span></>}
      {run.startedByText && <> · {run.startedByText}</>}
    </>
  )
  const time = run.group === 'running' ? (run.startedAt ? forText(run.startedAt) : undefined)
    : run.group === 'queued' ? undefined
      : whenText(run.endedAt ?? run.updatedAt)

  let action: ReactNode = null
  const request = run.group === 'waiting' && run.wantsApproval && run.ref ? run.ref : null
  if (!mayAct) {
    action = null
  } else if (request) {
    action = (
      <PanelItemAction
        look="primary"
        disabled={approving === request}
        onClick={async () => { if (!(await approve(request))) (onOpenRequest ?? (() => onOpen(run)))(request) }}
      >
        Approve
      </PanelItemAction>
    )
  } else if (run.group === 'waiting') {
    action = <PanelItemAction onClick={() => onOpen(run)}>Open</PanelItemAction>
  } else if (run.group === 'running' && run.sessionId) {
    const sessionId = run.sessionId
    action = (
      <PanelItemAction look="stop" disabled={busy} title="Stop this run" onClick={() => act(() => stopRun({ sessionId }))}>
        Stop
      </PanelItemAction>
    )
  } else if (run.group === 'queued' && run.task) {
    const taskId = run.task.id
    action = (
      <PanelItemAction disabled={busy} title="Withdraw this queued run" onClick={() => act(() => cancelRun({ taskId }))}>
        Cancel
      </PanelItemAction>
    )
  }

  return (
    <PanelItem
      icon={run.agent ? <AgentAvatar name={run.agent.name} avatarUrl={avatarUrl} size="sm" /> : undefined}
      itemKey={run.ref}
      title={run.title}
      detail={detail}
      time={time}
      action={action}
      quiet={run.group === 'finished'}
      onOpen={() => (request && onOpenRequest ? onOpenRequest(request) : onOpen(run))}
    />
  )
}
