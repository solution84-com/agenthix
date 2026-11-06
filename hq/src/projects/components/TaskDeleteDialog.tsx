import { Button, Modal } from '@agenthix/ui/primitives'
import { deleteTakes } from './taskPageState'

/**
 * Delete… (T9): asks once, in the centre of the screen, naming the task and what goes with it, and offers archiving
 * instead. A task is smaller than a project, so nothing is typed.
 */
export function TaskDeleteDialog({ open, taskKey, title, comments, runs, conversation, busy, onCancel, onArchive, onDelete }: {
  open: boolean
  taskKey: string
  title: string
  comments: number
  runs: number
  conversation: boolean
  busy?: boolean
  onCancel: () => void
  onArchive: () => void
  onDelete: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={`Delete ${taskKey}?`} maxWidth="max-w-md">
      <p className="text-body text-text-primary">“{title}” goes, with:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-body text-text-secondary">
        {deleteTakes({ comments, runs, conversation }).map(line => <li key={line}>{line}</li>)}
      </ul>
      <p className="mt-3 text-body text-text-secondary">
        This can’t be undone. To keep it out of the way instead,{' '}
        <button type="button" onClick={onArchive} className="text-accent hover:underline">archive it</button>.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" disabled={busy} onClick={onDelete}>Delete task</Button>
      </div>
    </Modal>
  )
}

/** A deleted or missing task's address (T9). */
export function TaskGone({ onBack }: { onBack: () => void }) {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h2 className="text-h2 font-semibold text-text-primary">This task doesn’t exist any more</h2>
      <p className="mt-2 text-body text-text-secondary">It was deleted, or the address is wrong.</p>
      <div className="mt-5 flex justify-center">
        <Button variant="secondary" onClick={onBack}>Back to Tasks</Button>
      </div>
    </div>
  )
}
