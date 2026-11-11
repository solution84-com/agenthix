import { useState, useEffect } from 'react'
import { useQuery, useAction, getUserSettings, updateUserSettings } from 'wasp/client/operations'

type Mode = 'WAIT' | 'INTERRUPT'

const OPTIONS: { value: Mode; label: string; desc: string }[] = [
  { value: 'WAIT', label: 'Wait', desc: 'Your message waits for the answer to finish, then the agent replies to it.' },
  { value: 'INTERRUPT', label: 'Interrupt', desc: 'The agent stops the answer it was giving and starts on your new message instead.' },
]

/** What happens when the person sends a message while an agent is still answering. */
export function BusyConversationSection() {
  const { data: settings } = useQuery(getUserSettings)
  const updateAction = useAction(updateUserSettings)
  const [mode, setMode] = useState<Mode>('WAIT')
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (settings) setMode(settings.busyConversationMode ?? 'WAIT') }, [settings])

  async function choose(next: Mode) {
    setMode(next)
    setSaving(true)
    try {
      await updateAction({ busyConversationMode: next })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3" role="radiogroup" aria-label="Sending while it works">
      {OPTIONS.map(opt => (
        <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="busyConversationMode"
            value={opt.value}
            checked={mode === opt.value}
            disabled={saving}
            onChange={() => void choose(opt.value)}
            className="mt-0.5 accent-accent"
          />
          <span>
            <span className="text-body text-text-primary">{opt.label}</span>
            <span className="block text-small text-text-secondary">{opt.desc}</span>
          </span>
        </label>
      ))}
    </div>
  )
}
