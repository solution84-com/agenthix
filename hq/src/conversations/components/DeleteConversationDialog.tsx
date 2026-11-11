import { useState } from 'react'
import { useQuery, getConversationDeletePreview, deleteConversation } from 'wasp/client/operations'
import { Button, Modal } from '@agenthix/ui/primitives'
import { actionErrorText } from '../hooks/threadState'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * The confirm for deleting a conversation: it names the work that stops and the work that carries on, and offers
 * *Archive* beside *Delete* when the conversation can be kept instead.
 */
export function DeleteConversationDialog({ conversationId, onClose, onDeleted, onArchive }: {
  conversationId: string
  onClose: () => void
  onDeleted: () => void
  /** Present where archiving by hand is offered. */
  onArchive?: () => Promise<void>
}) {
  const { data, error, isLoading } = useQuery(getConversationDeletePreview, { conversationId })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const run = async (action: () => Promise<void>, then: () => void) => {
    setBusy(true)
    setProblem(null)
    try {
      await action()
      then()
    } catch (err) {
      setProblem(actionErrorText(err))
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title="Delete this conversation?" maxWidth="max-w-md">
      <div className="space-y-4" data-testid="delete-confirm">
        <ShowAttention text={error} title="Could not read what deleting would remove" />
        {isLoading && !error && <p className="text-small text-text-muted">Loading…</p>}
        {data && (
          <>
            <p className="text-small text-text-secondary" data-testid="delete-counts">{goesWith(data.messages, data.runs)}</p>
            {data.stops.length > 0 && (
              <div>
                <p className="text-small font-medium text-text-primary">Stops and goes</p>
                <ul className="mt-1 list-disc pl-5 text-small text-text-secondary" data-testid="delete-stops">
                  {data.stops.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
            )}
            {data.leaves.length > 0 && (
              <div>
                <p className="text-small font-medium text-text-primary">Carries on, as the project's work</p>
                <ul className="mt-1 list-disc pl-5 text-small text-text-secondary" data-testid="delete-leaves">
                  {data.leaves.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
        <ShowAttention text={problem} title="The conversation was not deleted" onClose={() => setProblem(null)} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          {data?.canArchive && onArchive && (
            <Button variant="secondary" disabled={busy} onClick={() => void run(onArchive, onClose)}>Archive</Button>
          )}
          <Button variant="danger" disabled={busy || !data} onClick={() => void run(() => deleteConversation({ conversationId }).then(() => undefined), onDeleted)}>
            Delete
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** What is counted of what goes, in words: the messages always, the runs of its background work when there are any. */
function goesWith(messages: number, runs: number): string {
  const many = (n: number, one: string, more: string) => `${n} ${n === 1 ? one : more}`
  const runsText = runs > 0 ? ` and ${many(runs, 'run of its work in the background', 'runs of its work in the background')}` : ''
  return `Deleting is permanent. It takes with it ${many(messages, 'message', 'messages')}${runsText}.`
}
