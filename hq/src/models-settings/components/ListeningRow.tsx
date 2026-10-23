import { useState } from 'react'
import { NativeSelect } from '@agenthix/ui/primitives'
import { STT_PRICES_PER_HOUR_MICROS } from '@agenthix/core'
import { LISTENING_MODELS } from '../../voice/voiceModels'
import type { ChoiceView, VoiceInput, VoiceProviderOption } from '../types'
import { LINK, SettingRow, Whose } from './SettingRow'
import type { Whom } from './ModelChoiceRow'

const priceOf = (model: string): string | null => {
  const micros = STT_PRICES_PER_HOUR_MICROS.assemblyai?.[model]
  return micros === undefined ? null : `$${(Number(micros) / 1_000_000).toFixed(2)} an hour`
}

const detail = (m: (typeof LISTENING_MODELS)[number]) => [m.note, priceOf(m.model)].filter(Boolean).join(' · ')

/** Listening: one of AssemblyAI's three live models, each shown with its languages and price. */
export function ListeningRow({ options, own, shown, whom, onChange }: {
  options: VoiceProviderOption[]
  own: ChoiceView | null
  shown: ChoiceView | null
  whom?: Whom
  onChange: (value: Exclude<VoiceInput, null>) => void
}) {
  const [changing, setChanging] = useState(false)
  const providerId = shown?.providerId ?? options.find(o => o.state === 'works')?.providerId ?? options[0]?.providerId
  const provider = options.find(o => o.providerId === providerId)
  const current = LISTENING_MODELS.find(m => m.model === shown?.model)
  const buttonText = whom && !own ? `Give ${whom.agent} its own` : 'Change'
  return (
    <SettingRow
      label="Listening"
      value={shown
        ? <>{current ? `${current.label}, ${current.languages}` : shown.model}{provider ? ` · via ${provider.name}` : ''}{shown.notWorking ? ' · not working' : ''}{whom && <Whose text={own ? `${whom.agent}'s own` : `${whom.org}'s`} />}</>
        : <span className="text-text-muted">Not chosen</span>}
      hint={current ? detail(current) : undefined}
      actions={changing && providerId ? (
        <NativeSelect className="w-72" aria-label="Listening model" autoFocus value={shown?.model ?? ''}
          onBlur={() => setChanging(false)}
          onChange={e => { setChanging(false); onChange({ providerId, model: e.target.value }) }}>
          {LISTENING_MODELS.map(m => <option key={m.model} value={m.model}>{m.label}, {m.languages}{detail(m) ? ` · ${detail(m)}` : ''}</option>)}
        </NativeSelect>
      ) : (
        <>
          <button type="button" className={LINK} disabled={!providerId} onClick={() => setChanging(true)}>{buttonText}</button>
          {whom && own && <button type="button" className={LINK} onClick={whom.onFollow}>Follow {whom.org}</button>}
        </>
      )}
    />
  )
}
