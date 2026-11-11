import { useState } from 'react'
import { NativeSelect, FOCUS_RING } from '@agenthix/ui/primitives'
import { useAction, useQuery, getAgents, getPrimaryAgent, setPrimaryAgent } from 'wasp/client/operations'
import { actionErrorText } from '../hooks/threadState'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'

/**
 * The agent a new conversation starts with (Settings). Kernel unless the person chooses another; resetting
 * returns to Kernel. The server decides which agents may be primary and says why when one may not.
 */
export function PrimaryAgentSection() {
  const primaryQuery = useQuery(getPrimaryAgent)
  const { data: primary, refetch } = primaryQuery
  const read = useBackgroundRead(primaryQuery, { what: 'Your primary agent' })
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

  if (!primary) return read.failedWithoutData ? <>{read.nudge}</> : <p className="text-small text-text-muted">Loading…</p>
  const choices = agents ?? []
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-small text-text-muted" htmlFor="primary-agent">Primary agent</label>
        <NativeSelect
          id="primary-agent"
          className="w-auto"
          value={primary.agent.id}
          disabled={saving}
          onChange={(e) => void change(e.target.value)}
        >
          {choices.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </NativeSelect>
        {!primary.isDefault && (
          <button type="button" disabled={saving} onClick={() => void change(null)} className={`rounded text-small font-medium text-link not-disabled:hover:underline disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING}`}>
            Reset to Kernel
          </button>
        )}
      </div>
      {primary.isDefault && <p className="text-small text-text-secondary">{primary.agent.name} is the built-in agent, used until you choose another.</p>}
      <ShowAttention kind="alert" text={message && !message.ok ? message.text : null} title="Your agent was not changed" onClose={() => setMessage(null)} />
    </div>
  )
}
