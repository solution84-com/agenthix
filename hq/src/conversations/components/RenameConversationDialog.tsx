import { useState } from 'react'
import { renameConversation } from 'wasp/client/operations'
import { Button, Input, Modal } from '@agenthix/ui/primitives'
import { actionErrorText } from '../hooks/threadState'
import { ShowAttention } from '@agenthix/ui/attention'

/** Rename: the conversation's title as a person gives it, in place of the first words of the first answer. */
export function RenameConversationDialog({ conversationId, title, onClose }: { conversationId: string; title: string; onClose: () => void }) {
  const [value, setValue] = useState(title)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const save = async () => {
    setBusy(true)
    setProblem(null)
    try {
      await renameConversation({ conversationId, title: value })
      onClose()
    } catch (err) {
      setProblem(actionErrorText(err, 'Could not rename the conversation'))
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title="Rename this conversation" maxWidth="max-w-md">
      <form className="space-y-4" data-testid="rename-conversation" onSubmit={(e) => { e.preventDefault(); if (value.trim()) void save() }}>
        <Input autoFocus aria-label="Name" value={value} maxLength={120} onChange={(e) => setValue(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy || !value.trim()}>Save</Button>
        </div>
      </form>
      <ShowAttention text={problem} title="The conversation was not renamed" onClose={() => setProblem(null)} />
    </Modal>
  )
}
