import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery, useAction, getProjectAutomation, updateProjectAutomation, getAutomationOutlook, getProjectRoutines } from 'wasp/client/operations'
import {
  AutomationOverview, NO_AUTOMATION_CHOICE,
  type AutomationLaterItem, type AutomationState, type AutomationStatusView, type AutomationStuckItem,
} from '@agenthix/ui/projects'
import { usePlaceUrl } from '../../places/usePlaceUrl'
import { AutomationRoutinesView, NewRoutine, OneRoutine } from './AutomationRoutinesView'
import { AutomationRulesView } from './AutomationRulesView'
import { useAutomationToolUrl } from './useAutomationToolUrl'

/** How often the tool reads again, so a person can watch it change while they keep talking (spec §3). */
export const AUTOMATION_REFRESH_MS = 15_000

type Outlook = {
  projectKey: string
  running: Array<{ taskId: string; key: string; title: string }>
  stuck: AutomationStuckItem[]
  later: AutomationLaterItem[]
  laterMore: number
}

export const PAUSE_REFUSAL = 'Only a project admin can pause or resume automation.'

export function automationState(status: AutomationStatusView): AutomationState {
  if (!status.org.allowed) return 'orgOff'
  return status.effective.enabled ? 'running' : 'paused'
}

/** What is in line and, where the throttle holds work, the round. */
export function nowCounts(status: AutomationStatusView) {
  const throttling = status.effective.throttle && status.throttled > 0
  return {
    inLine: status.queued + status.throttled,
    round: !throttling ? null : status.roundOpen ? { open: true as const } : { open: false as const, nextAt: status.nextPulseAt },
  }
}

/**
 * The Automation tool (every screen reviewed spec §3), for a project and for
 * the personal space alike: status, Now and Later first; Routines and Rules
 * each a view of their own, opened from their buttons; a routine at its own
 * address inside the tool. What is open is in the address.
 */
export function AutomationTool({ projectId, isProjectAdmin }: { projectId: string; isProjectAdmin: boolean }) {
  const { screen, toOverview, toRules, toRoutines, toNewRoutine, toRoutine } = useAutomationToolUrl()
  const navigate = useNavigate()
  const { openTool } = usePlaceUrl()
  const live = { refetchInterval: AUTOMATION_REFRESH_MS }
  const { data: statusData } = useQuery(getProjectAutomation, { projectId }, live)
  const { data: outlookData } = useQuery(getAutomationOutlook, { projectId }, live)
  const { data: routines } = useQuery(getProjectRoutines, { projectId })
  const save = useAction(updateProjectAutomation)
  const [busy, setBusy] = useState(false)
  const [toggleError, setToggleError] = useState('')
  const status = statusData as AutomationStatusView | undefined
  const outlook = outlookData as Outlook | undefined

  // A routine takes the room the tool has: given it, its rounds sit beside what it creates.
  if (screen.view === 'routine') return <OneRoutine routineId={screen.routineId} onBack={toRoutines} />
  if (screen.view === 'newRoutine') {
    return <div className="max-w-xl"><NewRoutine projectId={projectId} onCancel={toRoutines} onCreated={toRoutine} /></div>
  }
  if (screen.view === 'routines') {
    return (
      <div className="max-w-xl">
        <AutomationRoutinesView projectId={projectId} onOpen={toRoutine} onNew={toNewRoutine} onBack={toOverview} />
      </div>
    )
  }
  if (!status || !outlook) return <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (screen.view === 'rules') {
    return (
      <div className="max-w-xl p-4">
        <AutomationRulesView projectId={projectId} projectKey={outlook.projectKey} status={status} isProjectAdmin={isProjectAdmin} onBack={toOverview} />
      </div>
    )
  }

  const keyOf = new Map([...outlook.running, ...outlook.later.flatMap(i => (i.kind === 'task' ? [i] : []))].map(t => [t.taskId, t.key]))
  const toggle = async () => {
    setBusy(true)
    setToggleError('')
    try {
      await save({ projectId, ...(status.choice ?? NO_AUTOMATION_CHOICE), enabled: !status.effective.enabled })
    } catch (e) {
      setToggleError(e instanceof Error ? e.message : 'That did not work')
    } finally {
      setBusy(false)
    }
  }
  const fix = (item: AutomationStuckItem) => {
    if (item.kind === 'routinePaused') toRoutine(item.routineId)
    else navigate(`/tasks/${item.key}`)
  }

  return (
    <div className="max-w-xl p-4">
      <AutomationOverview
        state={automationState(status)}
        toggleRefusal={isProjectAdmin ? undefined : PAUSE_REFUSAL}
        busy={busy}
        toggleError={toggleError}
        onToggle={() => void toggle()}
        now={{ running: outlook.running, stuck: outlook.stuck, ...nowCounts(status) }}
        routineCount={(routines as unknown[] | undefined)?.length ?? 0}
        later={outlook.later}
        laterMore={outlook.laterMore}
        renderTaskLink={(taskId, children) => (
          <Link className="hover:underline" to={`/tasks/${keyOf.get(taskId) ?? ''}`}>{children}</Link>
        )}
        onFix={fix}
        onOpenRoutine={toRoutine}
        onOpenRuns={() => openTool('runs')}
        onOpenRoutines={toRoutines}
        onOpenRules={toRules}
      />
    </div>
  )
}
