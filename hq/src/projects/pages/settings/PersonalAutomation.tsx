import { useState } from 'react'
import { useQuery, useAction, getProjectAutomation, updateProjectAutomation } from 'wasp/client/operations'
import { AutomationSwitch } from '@agenthix/ui/projects'
import { PROJECT_AUTOMATION_DEFAULTS } from '../../../automation/automationSettings'
import { Part } from './Part'

/** A personal project's automation switch: whether routines may start work here without its owner pressing Run. */
export function PersonalAutomation({ projectId }: { projectId: string }) {
  const { data, refetch } = useQuery(getProjectAutomation, { projectId })
  const update = useAction(updateProjectAutomation)
  const [problem, setProblem] = useState('')
  const on = data?.effective.enabled ?? false

  const change = async (enabled: boolean) => {
    setProblem('')
    try {
      await update({ projectId, ...(data?.choice ?? PROJECT_AUTOMATION_DEFAULTS), enabled })
      await refetch()
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Could not change automation')
    }
  }

  return (
    <Part label="Automation" hint={on ? 'On. Routines start work here without you pressing Run.' : 'Off. Lets routines start work here without you pressing Run.'}>
      <AutomationSwitch on={on} disabled={!data} onChange={next => void change(next)} label="Automation" />
      {problem && <p role="alert" className="text-small text-danger">{problem}</p>}
    </Part>
  )
}
