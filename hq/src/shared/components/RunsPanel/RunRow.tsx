import type { ReactNode } from 'react'
import { PanelItem, PanelItemAction } from '@agenthix/ui/primitives'
import { RunAvatar } from '@agenthix/ui/tasks'
import { AgentAvatar } from '../SessionComponents'
import { useAgentImageUrl } from '../../hooks/useAgentImageUrl'
import { useMayWorkWhere } from '../../hooks/useMayWork'
import type { MyRun } from '../../../runs/queries'
import { runPlace, runRing, runState } from './runsListLogic'
import { forText, whenText } from './panelTime'

/**
 * One run in two lines (the Runs panel design), the same line as everywhere a run is listed: the agent's avatar with
 * its ring (D18) in place of a state chip, the task or conversation with its key, then the agent, place and state, and
 * who started it when it was not the viewer. A row that needs the person carries its one answer: Review opens a
 * request for an okay, Answer opens the run. A click opens its task or conversation.
 */
export function RunRow({ run, onOpen, onOpenRequest }: {
  run: MyRun
  onOpen: (run: MyRun) => void
  onOpenRequest?: (taskKey: string) => void
}) {
  // A run in a task of a project the person only reads offers nothing to do (adr-0102); their own conversation is theirs.
  const mayWork = useMayWorkWhere('key')
  const mayAct = !run.task || mayWork(run.place.projectKey)
  const avatarUrl = useAgentImageUrl(run.agent?.avatarUrl)

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
  if (mayAct && request) {
    action = <PanelItemAction onClick={() => (onOpenRequest ? onOpenRequest(request) : onOpen(run))}>Review</PanelItemAction>
  } else if (mayAct && run.group === 'waiting') {
    action = <PanelItemAction onClick={() => onOpen(run)}>{runRing(run) === 'FAILED' ? 'Open' : 'Answer'}</PanelItemAction>
  }
  const ring = runRing(run)

  return (
    <PanelItem
      icon={run.agent ? (
        <RunAvatar name={run.agent.name} state={ring} detail={state}>
          <AgentAvatar name={run.agent.name} avatarUrl={avatarUrl} size="md" />
        </RunAvatar>
      ) : undefined}
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
