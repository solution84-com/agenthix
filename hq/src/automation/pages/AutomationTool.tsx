import { Link, useNavigate } from 'react-router'
import { useQuery, getProjectAutomation, getAutomationOutlook, getProjectRoutines } from 'wasp/client/operations'
import {
  AutomationOverview, type AutomationLaterItem, type AutomationStatusView, type AutomationStuckItem,
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

/**
 * The Automation tool (every screen reviewed spec §3), for a project and for
 * the personal space alike: Now and Later first; Routines and Rules
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
  const fix = (item: AutomationStuckItem) => {
    if (item.kind === 'routinePaused') toRoutine(item.routineId)
    else navigate(`/tasks/${item.key}`)
  }

  return (
    <div className="max-w-xl p-4">
      <AutomationOverview
        now={{ running: outlook.running, stuck: outlook.stuck }}
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
