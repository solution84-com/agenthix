import { useQuery, useAction, getBoardTemplates, getBoardTemplate, createBoard } from 'wasp/client/operations'
import { TasksViewHeader } from '@agenthix/ui/tasks'
import { NewBoardForm, type BoardTemplateOption } from '@agenthix/ui/board'

function TemplateColumns({ template }: { template: BoardTemplateOption }) {
  const { data } = useQuery(getBoardTemplate, { id: template.id })
  const columns = (data as { columns?: { label: string }[] } | null | undefined)?.columns
  return <>{columns && columns.length > 0 ? columns.map(c => c.label).join(' · ') : template.description ?? ''}</>
}

/** New board, in place (every screen reviewed spec §3). */
export function NewBoardScreen({ projectId, onBack, onCreated }: { projectId: string; onBack: () => void; onCreated: (boardId: string) => void }) {
  const { data } = useQuery(getBoardTemplates)
  const createFn = useAction(createBoard)
  const templates = (data ?? []) as BoardTemplateOption[]
  return (
    <div className="@container">
      <TasksViewHeader back="Boards" onBack={onBack} title="New board" />
      <NewBoardForm
        templates={templates}
        renderTemplateDetail={t => <TemplateColumns template={t} />}
        onCancel={onBack}
        onCreate={async ({ name, kind, templateId }) => {
          const board = await createFn({ projectId, name, kind, templateId: templateId || undefined })
          onCreated(board.id)
        }}
      />
    </div>
  )
}
