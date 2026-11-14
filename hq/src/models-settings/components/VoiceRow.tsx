import { useState } from 'react'
import { DEFAULT_VOICE, VOICE_TTS_MODEL } from '../../voice/voiceModels'
import type { ChoiceView, VoiceInput, VoiceProviderOption } from '../types'
import { VoiceDialog, VoicePlayButton } from './voice/VoiceDialog'
import { LINK, SettingRow, Whose } from './SettingRow'
import type { Whom } from './ModelChoiceRow'

const SPEECH_MODEL = 'Inworld TTS 2'

/** The provider a speaking choice is on: the one chosen, else one that works. */
const speakingProvider = (options: VoiceProviderOption[], shown: ChoiceView | null) =>
  shown?.providerId ?? options.find(o => o.state === 'works')?.providerId ?? options[0]?.providerId

/** *Change* for Speaking and the pop-up it opens, where a voice is chosen by ear. The row and the AI page's Speaking line both use it. */
export function SpeakingChange({ options, shown, onChange, buttonText = 'Change', ariaLabel }: {
  options: VoiceProviderOption[]
  shown: ChoiceView | null
  onChange: (value: Exclude<VoiceInput, null>) => void
  buttonText?: string
  ariaLabel?: string
}) {
  const [choosing, setChoosing] = useState(false)
  const providerId = speakingProvider(options, shown)
  return (
    <>
      <button type="button" className={LINK} disabled={!providerId} aria-label={ariaLabel} onClick={() => setChoosing(true)}>{buttonText}</button>
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

/**
 * Speaking: the voice, chosen by ear in the provider's own list, and spoken in Inworld TTS 2, the only speech model
 * it supports. Every agent speaks in a voice, so the organisation's can be changed but never cleared.
 */
export function VoiceRow({ options, own, shown, whom, onChange, label = 'Speaking' }: {
  label?: string
  options: VoiceProviderOption[]
  own: ChoiceView | null
  shown: ChoiceView | null
  whom?: Whom
  onChange: (value: Exclude<VoiceInput, null>) => void
}) {
  const providerId = speakingProvider(options, shown)
  const provider = options.find(o => o.providerId === providerId)
  const voice = shown?.voice ?? DEFAULT_VOICE
  const buttonText = whom && !own ? `Give ${whom.agent} its own` : 'Change'
  return (
    <SettingRow
      label={label}
      lead={shown && providerId ? <VoicePlayButton providerId={providerId} voiceId={voice} /> : undefined}
      value={shown
        ? <>{voice} · {SPEECH_MODEL}{provider ? ` · via ${provider.name}` : ''}{shown.notWorking ? ' · not working' : ''}{whom && <Whose text={own ? `${whom.agent}'s own` : `${whom.org}'s`} />}</>
        : <span className="text-text-muted">Not chosen</span>}
      actions={(
        <>
          <SpeakingChange options={options} shown={shown} onChange={onChange} buttonText={buttonText} />
          {whom && own && <button type="button" className={LINK} onClick={whom.onFollow}>Follow {whom.org}</button>}
        </>
      )}
    />
  )
}
