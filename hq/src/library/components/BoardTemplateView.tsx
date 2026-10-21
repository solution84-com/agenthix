import { useQuery, getBoardTemplate } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import type { BoardTemplateColumn } from '../boardTemplateService'
import { ColumnStatusBadge } from './ColumnStatusBadge'

/** A board in the library, opened: its columns. A board is chosen when one is added to a project. */
export function BoardTemplateView({ templateId, onClose }: { templateId: string | null; onClose: () => void }) {
  const { data: template } = useQuery(getBoardTemplate, { id: templateId! }, { enabled: templateId !== null })
  const columns: BoardTemplateColumn[] = Array.isArray(template?.columns) ? [...template.columns].sort((a: BoardTemplateColumn, b: BoardTemplateColumn) => a.order - b.order) : []
  return (
    <Modal open={templateId !== null} onClose={onClose} title={template?.name ?? 'Board'} maxWidth="max-w-xl">
      {template?.description && <p className="mb-3 text-small text-text-secondary">{template.description}</p>}
      <p className="mb-3 text-small text-text-muted">Choose it when you add a board to a project; the project gets its own copy.</p>
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {columns.map(c => (
          <div key={c.name} className="rounded-lg border border-border-subtle p-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden />
              <span className="flex-1 text-small font-medium text-text-primary">{c.label}</span>
              <ColumnStatusBadge status={c.status} />
              {c.autoQueue && <span className="rounded bg-success/10 px-1.5 py-0.5 text-micro font-medium text-success">auto-queue</span>}
            </div>
            {c.description && <p className="mt-1 pl-[18px] text-micro text-text-muted">{c.description}</p>}
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end"><Button variant="ghost" onClick={onClose}>Close</Button></div>
    </Modal>
  )
}
