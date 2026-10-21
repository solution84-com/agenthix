import { TasksViewHeader } from '@agenthix/ui/tasks'
import { FinishSprintForm, type SprintInfo, type UnfinishedDestination } from '@agenthix/ui/board'

/** Finish sprint, in place (every screen reviewed spec §3): "‹ Product", then where the unfinished tasks go. */
export function FinishSprintScreen({ boardName, sprint, doneCount, unfinishedCount, lengthDays, onBack, onFinish }: {
  boardName: string
  sprint: SprintInfo
  doneCount: number
  unfinishedCount: number
  lengthDays: number
  onBack: () => void
  onFinish: (destination: UnfinishedDestination) => Promise<void>
}) {
  return (
    <div className="@container">
      <TasksViewHeader back={boardName} onBack={onBack} title={`Finish ${sprint.label}`} />
      <FinishSprintForm
        sprint={sprint} doneCount={doneCount} unfinishedCount={unfinishedCount} lengthDays={lengthDays}
        onFinish={onFinish} onCancel={onBack}
      />
    </div>
  )
}
