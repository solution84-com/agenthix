import { useState } from 'react'
import { useAction, useQuery, getAgents, getPrimaryAgent, setPrimaryAgent } from 'wasp/client/operations'
import { RefusedAction } from '../../shared/components/RefusedAction'
import { actionErrorText } from '../hooks/threadState'

/**
 * The agent a new conversation starts with (Settings). Kernel unless the person chooses another; resetting
 * returns to Kernel. The server decides which agents may be primary and says why when one may not.
 */
export function PrimaryAgentSection() {
  const { data: primary, refetch } = useQuery(getPrimaryAgent)
  const { data: agents } = useQuery(getAgents)
  const save = useAction(setPrimaryAgent)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const change = async (agentId: string | null) => {
    setSaving(true)
    setMessage(null)
    try {
      await save({ agentId })
      await refetch()
      setMessage({ ok: true, text: 'Saved.' })
    } catch (err) {
      setMessage({ ok: false, text: actionErrorText(err) })
    } finally {
      setSaving(false)
    }
  }

  if (!primary) return <p className="text-small text-text-muted">Loading…</p>
  const choices = agents ?? []
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-small text-text-muted" htmlFor="primary-agent">Primary agent</label>
        <select
          id="primary-agent"
          value={primary.agent.id}
          disabled={saving}
          onChange={(e) => void change(e.target.value)}
          className="rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-body text-text-primary focus:border-accent focus:outline-none"
        >
          {choices.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        {!primary.isDefault && (
          <button type="button" disabled={saving} onClick={() => void change(null)} className="text-small font-medium text-accent hover:text-accent-hover disabled:opacity-50">
            Reset to Kernel
          </button>
        )}
      </div>
      {primary.isDefault && <p className="text-small text-text-secondary">{primary.agent.name} is the built-in agent, used until you choose another.</p>}
      {message?.ok && <p role="status" className="text-small text-success">{message.text}</p>}
      <RefusedAction reason={message && !message.ok ? message.text : null} />
    </div>
  )
}
