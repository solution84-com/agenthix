import { useQuery, useAction, updateProjectAutomation, getProjectRunLimits, setProjectRunLimits } from 'wasp/client/operations'
import { AutomationRules, type AutomationRunLimits, type AutomationStatusView } from '@agenthix/ui/projects'

/**
 * The Automation tool's Rules view (spec §3). Whether agents may set start times and the turn limit are a project
 * admin's to change, as in its Settings before; the run time limit is shown here and changed in the project's Settings.
 */
export function AutomationRulesView({ projectId, status, isProjectAdmin, onBack }: {
  projectId: string
  projectKey: string
  status: AutomationStatusView
  isProjectAdmin: boolean
  onBack: () => void
}) {
  const { data: limitsData, refetch: refetchLimits } = useQuery(getProjectRunLimits, { projectId })
  const saveRules = useAction(updateProjectAutomation)
  const saveRunLimits = useAction(setProjectRunLimits)
  const runLimits = limitsData as AutomationRunLimits | undefined

  const onSaveTurnLimit = async (turnLimit: number | null) => {
    if (!runLimits || turnLimit === runLimits.own.turnLimit) return
    await saveRunLimits({ projectId, timeLimitMinutes: runLimits.own.timeLimitMinutes, turnLimit })
    await refetchLimits()
  }

  return (
    <AutomationRules
      status={status}
      runLimits={runLimits}
      canEdit={isProjectAdmin}
      onSaveAgentSchedules={async on => { await saveRules({ projectId, agentSchedules: on }) }}
      onSaveTurnLimit={onSaveTurnLimit}
      onBack={onBack}
    />
  )
}
