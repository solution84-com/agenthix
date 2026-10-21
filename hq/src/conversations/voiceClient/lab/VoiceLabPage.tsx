import { useEffect, useMemo, useState } from 'react'
import { AppLayout } from '../../../shared/layouts/AppLayout'
import { useVoiceCall, type VoiceCallValue } from '../../../shared/providers/VoiceCallProvider'
import type { VoiceRuntimeHandle } from '../runtime/types'
import { watchMirror } from './mirror'
import { RecordingPanel } from './RecordingPanel'
import { VoiceLab } from './VoiceLab'

// The voice session's `runtime()` is added by the move onto the runtime; until then the lab simply sees no runtime.
type WithRuntime = VoiceCallValue & { runtime?: () => VoiceRuntimeHandle | null }

const BREADCRUMBS = [{ label: 'Voice lab' }]

export function VoiceLabPage() {
  const call = useVoiceCall() as WithRuntime
  const phase = call.voice.phase
  // A new runtime is made each time voice starts; the phase changing is when to ask again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const local = useMemo(() => call.runtime?.() ?? null, [call.runtime, phase])
  // Voice running in another tab reaches this one through its mirror.
  const [mirrored, setMirrored] = useState<VoiceRuntimeHandle | null>(null)
  useEffect(() => (import.meta.env.DEV ? watchMirror(setMirrored) : undefined), [])
  const runtime = local ?? mirrored

  return (
    <AppLayout breadcrumbs={BREADCRUMBS}>
      {import.meta.env.DEV
        ? <><VoiceLab runtime={runtime} /><RecordingPanel /></>
        : <p className="px-4 py-6 text-body text-text-muted lg:px-10">The voice lab exists only in development builds.</p>}
    </AppLayout>
  )
}
