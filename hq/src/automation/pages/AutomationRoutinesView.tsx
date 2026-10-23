import { useState } from 'react'
import {
  useQuery, useAction, getProjectRoutines, getRoutine, createRoutine, pauseRoutine, resumeRoutine,
} from 'wasp/client/operations'
import { AutomationRoutines, type AutomationRoutineRow } from '@agenthix/ui/projects'
import { RoutineForm } from '@agenthix/ui/tasks'
import { PanelHeaderContent, ViewHeaderRow } from '@agenthix/ui/primitives'
import { LAST_ROUNDS, type RoutineDetail as RoutineDetailData } from '../../shared/routineTypes'
import { useMayWork } from '../../shared/hooks/useMayWork'
import { RoutineDetail } from './RoutineDetail'
import { useRoutineFormData } from './routineFormData'
import { TaskModelField } from '../../models-settings/components/TaskModelField'
import { routineTemplateArgs } from './routineTemplateArgs'

/** One routine at its own address inside the tool; Older rounds reads more of its rounds. */
export function OneRoutine({ routineId, onBack }: { routineId: string; onBack: () => void }) {
  const [rounds, setRounds] = useState(LAST_ROUNDS)
  const { data, error } = useQuery(getRoutine, { routineId, rounds })
  const routine = data as RoutineDetailData | undefined
  if (!routine) {
    return (
      <div>
        <ViewHeaderRow><PanelHeaderContent back="Routines" onBack={onBack} /></ViewHeaderRow>
        <p className="px-4 py-3 text-small text-text-muted">{error ? (error as Error).message : 'Loading…'}</p>
      </div>
    )
  }
  return <RoutineDetail routine={routine} onBack={onBack} onOlder={() => setRounds(r => r + 20)} />
}

/** New routine (spec §3): set up on the viewer's behalf; what was made opens at its own address. */
export function NewRoutine({ projectId, onCancel, onCreated, back = 'Routines' }: {
  projectId: string
  onCancel: () => void
  onCreated: (id: string) => void
  back?: string
}) {
  const { boards, agents } = useRoutineFormData(projectId)
  const createFn = useAction(createRoutine)
  return (
    <div>
      <ViewHeaderRow><PanelHeaderContent back={back} onBack={onCancel} title="New routine" /></ViewHeaderRow>
      <div className="px-4 py-3">
        <RoutineForm
          boards={boards}
          agents={agents}
          submitLabel="Set up routine"
          modelField={({ agentId, value, onChange }) => <TaskModelField projectId={projectId} agentId={agentId} value={value} onChange={onChange} />}
          onCancel={onCancel}
          onSubmit={async ({ template, schedule }) => {
            const { id } = await createFn({ projectId, template: routineTemplateArgs(template), schedule: schedule! })
            onCreated(id)
          }}
        />
      </div>
    </div>
  )
}

/**
 * The Automation tool's Routines view (spec §3): the list with each routine's switch and last rounds; New routine
 * sets one up on the viewer's behalf, which takes someone who works in the project (adr-0102).
 */
export function AutomationRoutinesView({ projectId, onOpen, onNew, onBack }: {
  projectId: string
  onOpen: (routineId: string) => void
  onNew: () => void
  onBack: () => void
}) {
  const canStartRuns = useMayWork(projectId)
  const { data } = useQuery(getProjectRoutines, { projectId })
  const pauseFn = useAction(pauseRoutine)
  const resumeFn = useAction(resumeRoutine)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const toggle = async (routineId: string, on: boolean) => {
    setBusyId(routineId)
    setError('')
    try {
      await (on ? resumeFn({ routineId }) : pauseFn({ routineId }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="p-4">
      <AutomationRoutines
        routines={data as AutomationRoutineRow[] | undefined}
        canCreate={canStartRuns}
        canResume={canStartRuns}
        busyId={busyId}
        error={error}
        onToggle={(id, on) => void toggle(id, on)}
        onOpen={onOpen}
        onNew={onNew}
        onBack={onBack}
      />
    </div>
  )
}
