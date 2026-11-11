import { Link, useNavigate } from 'react-router'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { useQuery, getProjectAutomation, getAutomationOutlook, getProjectRoutines } from 'wasp/client/operations'
import { useBackgroundRead } from '@agenthix/ui/attention'
import {
  AutomationOverview, type AutomationLaterItem, type AutomationStatusView, type AutomationStuckItem,
} from '@agenthix/ui/projects'
import { usePlaceUrl } from '../../places/usePlaceUrl'
import { ROUTINES_SECTION } from '../../projects/routines/routineAddresses'
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
 * the personal space alike: Now and Later first; Rules a view of its own. Routines live in the place's Routines
 * section: its button opens that section, and a routine opens at its own address. What is open is in the address.
 */
export function AutomationTool({ projectId, isProjectAdmin }: { projectId: string; isProjectAdmin: boolean }) {
  const { screen, toOverview, toRules } = useAutomationToolUrl()
  const navigate = useNavigate()
  const { openTool } = usePlaceUrl()
  const live = { refetchInterval: AUTOMATION_REFRESH_MS }
  const statusQuery = useQuery(getProjectAutomation, { projectId }, live)
  const outlookQuery = useQuery(getAutomationOutlook, { projectId }, live)
  const { data: statusData } = statusQuery
  const { data: outlookData } = outlookQuery
  const read = useBackgroundRead({
    data: statusData && outlookData ? true : undefined, error: statusQuery.error ?? outlookQuery.error ?? null,
    dataUpdatedAt: Math.min(statusQuery.dataUpdatedAt, outlookQuery.dataUpdatedAt),
    refetch: () => { void statusQuery.refetch(); void outlookQuery.refetch() },
  }, { what: 'Automation', pollMs: AUTOMATION_REFRESH_MS })
  const { data: routines } = useQuery(getProjectRoutines, { projectId })
  const status = statusData as AutomationStatusView | undefined
  const outlook = outlookData as Outlook | undefined

  if (!status || !outlook) return read.failedWithoutData ? read.nudge : <p className="px-4 py-6 text-small text-text-muted">Loading…</p>
  if (screen.view === 'rules') {
    return (
      <div className="max-w-xl p-4">
        <AutomationRulesView projectId={projectId} projectKey={outlook.projectKey} status={status} isProjectAdmin={isProjectAdmin} onBack={toOverview} />
      </div>
    )
  }

  const toRoutine = (routineId: string) => navigate(`/routines/${encodeURIComponent(routineId)}`)
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
          <Link className={`rounded hover:underline ${FOCUS_RING}`} to={`/tasks/${keyOf.get(taskId) ?? ''}`}>{children}</Link>
        )}
        onFix={fix}
        onOpenRoutine={toRoutine}
        onOpenRuns={() => openTool('runs')}
        onOpenRoutines={() => openTool(ROUTINES_SECTION)}
        onOpenRules={toRules}
      />
    </div>
  )
}
