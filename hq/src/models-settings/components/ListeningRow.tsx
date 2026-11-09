import { useState } from 'react'
import { NativeSelect } from '@agenthix/ui/primitives'
import { STT_PRICES_PER_HOUR_MICROS } from '@agenthix/core'
import { INWORLD_LISTENING_MODEL, LISTENING_MODELS } from '../../voice/voiceModels'
import type { ChoiceView, VoiceInput, VoiceProviderOption } from '../types'
import { LINK, SettingRow, Whose } from './SettingRow'
import type { Whom } from './ModelChoiceRow'

const priceOf = (model: string): string | null => {
  const micros = Object.values(STT_PRICES_PER_HOUR_MICROS).find(prices => model in prices)?.[model]
  return micros === undefined ? null : `$${(Number(micros) / 1_000_000).toFixed(2)} an hour`
}

const detail = (m: (typeof LISTENING_MODELS)[number]) => [m.note, priceOf(m.model)].filter(Boolean).join(' · ')

/** Where Inworld hears worse than AssemblyAI, said plainly: the spike's measurements, never a warning. */
export const INWORLD_QUALITY_NOTE = 'Hears about as well in our tests of clear English speech, but can write spoken times as digits. We recommend AssemblyAI for quality.'

/**
 * Listening: one of the live models of a provider that works (AssemblyAI's three, Inworld's one), each with its
 * languages and price. The model chosen decides the provider, so the one list also switches between them.
 */
export function ListeningRow({ options, own, shown, whom, onChange }: {
  options: VoiceProviderOption[]
  own: ChoiceView | null
  shown: ChoiceView | null
  whom?: Whom
  onChange: (value: Exclude<VoiceInput, null>) => void
}) {
  const [changing, setChanging] = useState(false)
  const shownProvider = options.find(o => o.providerId === shown?.providerId)
  const provider = shownProvider ?? options.find(o => o.state === 'works') ?? options[0]
  const choosable = options.filter(o => o.state === 'works' || o === provider)
  const current = LISTENING_MODELS.find(m => m.model === shown?.model)
  const offered = choosable.flatMap(o => LISTENING_MODELS.filter(m => o.models.includes(m.model)).map(m => ({ ...m, provider: o })))
  const several = choosable.length > 1
  const hearsOnInworld = shown?.model === INWORLD_LISTENING_MODEL
  const buttonText = whom && !own ? `Give ${whom.agent} its own` : 'Change'
  return (
    <SettingRow
      label="Listening"
      value={shown
        ? <>{current ? `${current.label}, ${current.languages}` : shown.model}{provider ? ` · via ${provider.name}` : ''}{shown.notWorking ? ' · not working' : ''}{whom && <Whose text={own ? `${whom.agent}'s own` : `${whom.org}'s`} />}</>
        : <span className="text-text-muted">Not chosen</span>}
      hint={!current && !hearsOnInworld ? undefined : <>{current ? detail(current) : null}{hearsOnInworld && <span className="block">{INWORLD_QUALITY_NOTE}</span>}</>}
      actions={changing && provider ? (
        <NativeSelect className="w-96 max-w-full" aria-label="Listening model" autoFocus value={shown?.model ?? ''}
          onBlur={() => setChanging(false)}
          onChange={e => { setChanging(false); onChange({ providerId: offered.find(m => m.model === e.target.value)?.provider.providerId ?? provider.providerId, model: e.target.value }) }}>
          {offered.map(m => <option key={m.model} value={m.model}>{m.label}, {m.languages}{detail(m) ? ` · ${detail(m)}` : ''}{several ? ` · via ${m.provider.name}` : ''}</option>)}
        </NativeSelect>
      ) : (
        <>
          <button type="button" className={LINK} disabled={!provider} onClick={() => setChanging(true)}>{buttonText}</button>
          {whom && own && <button type="button" className={LINK} onClick={whom.onFollow}>Follow {whom.org}</button>}
        </>
      )}
    />
  )
}
