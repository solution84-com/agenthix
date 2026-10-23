import { useEffect, useState } from 'react'
import { Input, NativeSelect } from '@agenthix/ui/primitives'
import type { ChoiceView, VoiceInput, VoiceProviderOption } from '../types'

/**
 * One voice setting: a provider with its speech model and, for speech out, the voice (models from one place, part 4).
 * Every agent has a voice, so there is no *none*: an agent may follow the organisation's, the organisation may not.
 */
export function VoiceChoiceRow({ label, hint, kind, options, current, followLabel, onChange }: {
  label: string
  hint: string
  kind: 'stt' | 'tts'
  options: VoiceProviderOption[]
  current: ChoiceView | null
  followLabel?: string
  onChange: (value: VoiceInput) => void
}) {
  const [providerId, setProviderId] = useState(current?.providerId ?? '')
  const [model, setModel] = useState(current?.model ?? '')
  const [voice, setVoice] = useState(current?.voice ?? '')
  useEffect(() => { setProviderId(current?.providerId ?? ''); setModel(current?.model ?? ''); setVoice(current?.voice ?? '') }, [current])
  const provider = options.find(o => o.providerId === providerId)

  const pickProvider = (id: string) => {
    setProviderId(id)
    const next = options.find(o => o.providerId === id)
    if (!next) return onChange(null)
    const firstModel = next.models[0] ?? ''
    setModel(firstModel)
    onChange({ providerId: id, model: firstModel, ...(kind === 'tts' && voice ? { voice } : {}) })
  }
  const save = (m: string, v: string) => onChange({ providerId, model: m, ...(kind === 'tts' && v ? { voice: v } : {}) })

  return (
    <div className="py-3">
      <div className="text-small font-medium text-text-primary">{label}</div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <NativeSelect className="w-52" value={providerId} aria-label={`${label} provider`} onChange={e => pickProvider(e.target.value)}>
          {followLabel !== undefined && <option value="">{followLabel}</option>}
          {followLabel === undefined && !providerId && <option value="" disabled>Choose a provider</option>}
          {options.map(o => <option key={o.providerId} value={o.providerId} disabled={o.state !== 'works'}>{o.name}{o.state !== 'works' ? ' · not working' : ''}</option>)}
        </NativeSelect>
        {provider && provider.models.length > 0 && (
          <NativeSelect className="w-60" value={model} aria-label={`${label} model`} onChange={e => { setModel(e.target.value); save(e.target.value, voice) }}>
            {provider.models.map(m => <option key={m}>{m}</option>)}
          </NativeSelect>
        )}
        {provider && kind === 'tts' && (
          <Input className="w-40" value={voice} aria-label={`${label} voice`} placeholder="Voice" maxLength={100}
            onChange={e => setVoice(e.target.value)} onBlur={() => { if (voice !== (current?.voice ?? '')) save(model, voice) }} />
        )}
      </div>
      <p className="mt-1 text-small text-text-muted">{hint}</p>
    </div>
  )
}
