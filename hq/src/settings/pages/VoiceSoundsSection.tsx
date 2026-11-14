import { useState } from 'react'
import { useQuery, useAction, getUserSettings, updateUserSettings } from 'wasp/client/operations'
import { WorkflowSwitch } from '../../workflows/components/WorkflowSwitch'
import { ShowAttention } from '@agenthix/ui/attention'
import { pressFailureWords } from '../../shared/failureWords'

const NOW = {
  on: 'On. A short sound when voice is ready and when it ends, when you mute or unmute, and when the connection drops.',
  off: 'Off. A call makes no sounds of its own; you still hear the agent.',
}

/** The person's own voice sounds: the short sounds of a call (conversations/voiceClient/voiceSounds.ts). On by default. */
export function VoiceSoundsSection() {
  const { data: settings, refetch } = useQuery(getUserSettings)
  const update = useAction(updateUserSettings)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!settings) return null
  const on = settings.voiceSounds ?? true

  async function toggle() {
    setSaving(true)
    setError(null)
    try {
      await update({ voiceSounds: !on })
      await refetch()
    } catch (err) {
      setError(pressFailureWords(err, 'That did not work.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-start justify-between gap-4" data-testid="voice-sounds">
      <div className="min-w-0">
        <span className="text-body font-medium text-text-primary">Voice sounds</span>
        <p className="mt-0.5 text-small text-text-secondary">{on ? NOW.on : NOW.off}</p>
        <ShowAttention kind="alert" text={error} title="Voice sounds were not changed" onClose={() => setError(null)} />
      </div>
      <WorkflowSwitch on={on} label="Voice sounds" busy={saving} onToggle={() => void toggle()} />
    </div>
  )
}
