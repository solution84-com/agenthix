import { Link } from 'react-router'
import {
  useQuery, useAction, updateProjectAutomation, getProjectRunLimits, setProjectRunLimits, getBoards,
} from 'wasp/client/operations'
import {
  AutomationRules, type AutomationChoice, type AutomationLimitsDraft, type AutomationRunLimits, type AutomationStatusView,
} from '@agenthix/ui/projects'
import { autoStartColumns } from './autoStartColumns'

/**
 * The Automation tool's Rules view (spec §3). The automation values and the turn
 * limit are a project admin's to change, as in its Settings before; the run time
 * limit is shown here and changed in the project's Settings.
 */
export function AutomationRulesView({ projectId, projectKey, status, isProjectAdmin, onBack }: {
  projectId: string
  projectKey: string
  status: AutomationStatusView
  isProjectAdmin: boolean
  onBack: () => void
}) {
  const { data: limitsData, refetch: refetchLimits } = useQuery(getProjectRunLimits, { projectId })
  const { data: boards } = useQuery(getBoards, { projectId })
  const saveChoice = useAction(updateProjectAutomation)
  const saveRunLimits = useAction(setProjectRunLimits)
  const runLimits = limitsData as AutomationRunLimits | undefined

  const onSaveChoice = async (choice: AutomationChoice) => {
    await saveChoice({ projectId, ...choice })
  }

  const onSaveLimits = async ({ choice, turnLimit }: AutomationLimitsDraft) => {
    if (runLimits && turnLimit !== runLimits.own.turnLimit) {
      await saveRunLimits({ projectId, timeLimitMinutes: runLimits.own.timeLimitMinutes, turnLimit })
      await refetchLimits()
    }
    await onSaveChoice(choice)
  }

  return (
    <AutomationRules
      status={status}
      runLimits={runLimits}
      canEdit={isProjectAdmin}
      onSaveChoice={onSaveChoice}
      onSaveLimits={onSaveLimits}
      columns={boards ? autoStartColumns(boards) : undefined}
      renderBoardLink={(boardId, children) => (
        <Link className="text-accent hover:underline" to={`/projects/${projectKey}/boards/${boardId}`}>{children}</Link>
      )}
      onBack={onBack}
    />
  )
}
