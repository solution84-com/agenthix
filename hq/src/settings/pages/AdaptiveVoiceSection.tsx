import { useState } from 'react'
import { useQuery, useAction, getUserSettings, updateUserSettings } from 'wasp/client/operations'
import { InfoButton } from '../../shared/components/InfoButton'
import { WorkflowSwitch } from '../../workflows/components/WorkflowSwitch'
import { ShowAttention } from '@agenthix/ui/attention'

const NOW = {
  on: 'On. The agent makes listening sounds while you talk and opens with a short sentence when a reply will take a while.',
  off: 'Off. No listening sounds and no opening sentence: the agent says nothing until its reply starts.',
}

/**
 * The person's own Adaptive voice (voice that stays in the conversation, spec §1): what an agent adds to a voice
 * conversation beyond speaking its reply. On by default; the voice client reads it each time voice starts.
 */
export function AdaptiveVoiceSection() {
  const { data: settings, refetch } = useQuery(getUserSettings)
  const update = useAction(updateUserSettings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!settings) return null
  const on = settings.adaptiveVoice ?? true

  async function toggle() {
    setSaving(true)
    setError(null)
    try {
      await update({ adaptiveVoice: !on })
      await refetch()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'That did not work.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-body font-medium text-text-primary">Adaptive voice</span>
          <InfoButton label="About Adaptive voice">
            <p>The small things an agent does so a voice conversation feels like talking to a person:</p>
            <ul className="list-disc space-y-1 pl-4">
              <li><span className="font-medium">Listening sounds</span> (“mm-hm”) while you talk.</li>
              <li><span className="font-medium">An opening sentence</span> when a reply will take a while: the agent
                says a short line first, such as “Let me look into that.” If it cannot, it says a stored standard
                phrase instead.</li>
            </ul>
            <p>Turn it off and you get neither: the agent says nothing until its reply starts.</p>
            <p className="text-text-muted">Not part of this setting, and always on: noticing when you have finished
              speaking, telling your voice from the agent’s, and stop words.</p>
          </InfoButton>
        </div>
        <p className="mt-0.5 text-small text-text-secondary">{on ? NOW.on : NOW.off}</p>
        <ShowAttention kind="alert" text={error} title="Adaptive voice was not changed" onClose={() => setError(null)} />
      </div>
      <WorkflowSwitch on={on} label="Adaptive voice" busy={saving} onToggle={() => void toggle()} />
    </div>
  )
}
