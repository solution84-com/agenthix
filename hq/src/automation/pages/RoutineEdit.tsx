import { useAction, updateRoutine } from 'wasp/client/operations'
import { RoutineForm, type ScheduleRuleInput } from '@agenthix/ui/tasks'
import { PanelHeaderContent, ViewHeaderRow } from '@agenthix/ui/primitives'
import type { RoutineDetail } from '../../shared/routineTypes'
import { useRoutineFormData } from './routineFormData'
import { routineTemplateArgs } from './routineTemplateArgs'
import { TaskModelField } from '../../models-settings/components/TaskModelField'

/** Edit routine, in place of the routine (spec §3): the same fields as New routine. */
export function RoutineEdit({ routine, onDone }: { routine: RoutineDetail; onDone: () => void }) {
  const { boards, agents } = useRoutineFormData(routine.projectId)
  const updateFn = useAction(updateRoutine)
  const waiting = routine.rounds.find(r => r.waiting)
  return (
    <div>
      <ViewHeaderRow>
        <PanelHeaderContent back={routine.title} onBack={onDone} title="Edit routine" />
      </ViewHeaderRow>
      <div className="px-4 py-3">
        <RoutineForm
          initial={{
            title: routine.title, description: routine.description ?? '',
            priority: routine.priority as 'LOW' | 'MEDIUM' | 'HIGH', labels: routine.labels,
            assignedAgentId: routine.assignedAgentId, modelChoice: routine.modelChoice, boardId: routine.boardId, stage: routine.column,
            rule: (routine.rule as ScheduleRuleInput | null) ?? { kind: 'interval', every: 1, unit: 'days' }, at: routine.scheduleAt,
          }}
          boards={boards}
          agents={agents}
          submitLabel="Save"
          waitingKey={waiting?.key ?? null}
          modelField={({ agentId, value, onChange }) => <TaskModelField projectId={routine.projectId} agentId={agentId} value={value} onChange={onChange} />}
          onCancel={onDone}
          onSubmit={async ({ template, schedule }) => {
            await updateFn({ routineId: routine.id, template: routineTemplateArgs(template), schedule })
            onDone()
          }}
        />
      </div>
    </div>
  )
}
