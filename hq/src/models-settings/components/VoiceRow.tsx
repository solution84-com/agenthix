import { useState } from 'react'
import { DEFAULT_VOICE, VOICE_TTS_MODEL } from '../../voice/voiceModels'
import type { ChoiceView, VoiceInput, VoiceProviderOption } from '../types'
import { VoiceDialog, VoicePlayButton } from './voice/VoiceDialog'
import { LINK, SettingRow, Whose } from './SettingRow'
import type { Whom } from './ModelChoiceRow'

const SPEECH_MODEL = 'Inworld TTS 2'

/**
 * The voice: chosen by ear in the provider's own list, and spoken in Inworld TTS 2, the only speech model voice
 * supports. Every agent has a voice, so the organisation's can be changed but never cleared.
 */
export function VoiceRow({ options, own, shown, whom, onChange, label = 'Voice' }: {
  label?: string
  options: VoiceProviderOption[]
  own: ChoiceView | null
  shown: ChoiceView | null
  whom?: Whom
  onChange: (value: Exclude<VoiceInput, null>) => void
}) {
  const [choosing, setChoosing] = useState(false)
  const providerId = shown?.providerId ?? options.find(o => o.state === 'works')?.providerId ?? options[0]?.providerId
  const provider = options.find(o => o.providerId === providerId)
  const voice = shown?.voice ?? DEFAULT_VOICE
  const buttonText = whom && !own ? `Give ${whom.agent} its own` : 'Change'
  return (
    <>
      <SettingRow
        label={label}
        lead={shown && providerId ? <VoicePlayButton providerId={providerId} voiceId={voice} /> : undefined}
        value={shown
          ? <>{voice} · {SPEECH_MODEL}{provider ? ` · via ${provider.name}` : ''}{shown.notWorking ? ' · not working' : ''}{whom && <Whose text={own ? `${whom.agent}'s own` : `${whom.org}'s`} />}</>
          : <span className="text-text-muted">Not chosen</span>}
        actions={(
          <>
            <button type="button" className={LINK} disabled={!providerId} onClick={() => setChoosing(true)}>{buttonText}</button>
            {whom && own && <button type="button" className={LINK} onClick={whom.onFollow}>Follow {whom.org}</button>}
          </>
        )}
      />
      {choosing && providerId && (
        <VoiceDialog
          providerId={providerId}
          current={shown?.voice ?? null}
          onClose={() => setChoosing(false)}
          onChoose={id => { setChoosing(false); onChange({ providerId, model: VOICE_TTS_MODEL, voice: id }) }}
        />
      )}
    </>
  )
}
