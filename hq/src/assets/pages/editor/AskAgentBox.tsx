import { useState } from 'react'
import { Button, Modal } from '@agenthix/ui/primitives'
import { editRequest, useAskAgent } from './askAgent'
import { AskWho } from './AskWho'

/** *Ask an agent to edit* (board U3b section 4; a dialog, walkthrough finding 22): who will answer and where, what to change, then a conversation docked beside the editor. */
export function AskAgentBox({ identity, where, onClose, onAsked }: { identity: string; where: string; onClose: () => void; onAsked: () => void }) {
  const [ask, setAsk] = useState('')
  const asking = useAskAgent()
  const { ask: send, sending, error } = asking
  return (
    <Modal open onClose={onClose} title="Ask an agent to edit" maxWidth="max-w-xl">
      <form
        role="dialog" aria-modal="true" aria-label="Ask an agent to edit"
        onSubmit={async e => { e.preventDefault(); if (ask.trim() && (await send(editRequest(identity, where, ask)))) onAsked() }}
      >
        <label htmlFor="ask-agent" className="block text-small font-medium text-text-secondary">What should the agent change in {identity}?</label>
        <textarea
          id="ask-agent" autoFocus value={ask} onChange={e => setAsk(e.target.value)} rows={2}
          className="mt-1 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          placeholder="Add a script that groups the pull requests by label, and use it from SKILL.md."
        />
        <p className="mt-1 text-micro text-text-muted">The agent writes to your draft; nothing reaches an agent until you publish.</p>
        <div className="mt-2"><AskWho asking={asking} disabled={sending} /></div>
        {error && <p role="alert" className="mt-1 text-small text-danger">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="submit" size="sm" disabled={sending || ask.trim() === '' || !asking.agent}>Ask {asking.agent?.name ?? ''}</Button>
        </div>
      </form>
    </Modal>
  )
}
