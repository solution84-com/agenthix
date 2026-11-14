import { useState } from 'react'
import { STT_PRICES_PER_HOUR_MICROS } from '@agenthix/core'
import { INWORLD_LISTENING_MODEL, LISTENING_MODELS } from '../../voice/voiceModels'
import type { ChoiceView, VoiceInput, VoiceProviderOption } from '../types'
import { LINK, SettingRow, Whose } from './SettingRow'
import { ListeningDialog } from './ListeningDialog'
import type { Whom } from './ModelChoiceRow'

const priceOf = (model: string): string | null => {
  const micros = Object.values(STT_PRICES_PER_HOUR_MICROS).find(prices => model in prices)?.[model]
  return micros === undefined ? null : `$${(Number(micros) / 1_000_000).toFixed(2)} an hour`
}

const detail = (m: (typeof LISTENING_MODELS)[number], showPrice: boolean) => [m.note, showPrice ? priceOf(m.model) : null].filter(Boolean).join(' · ')

/** Where Inworld hears worse than AssemblyAI, said plainly: the spike's measurements, never a warning. */
export const INWORLD_QUALITY_NOTE = 'Hears about as well in our tests of clear English speech, but can write spoken times as digits. We recommend AssemblyAI for quality.'

type ChangeProps = {
  label: string
  showPrice: boolean
  options: VoiceProviderOption[]
  shown: ChoiceView | null
  onChange: (value: Exclude<VoiceInput, null>) => void
  buttonText?: string
  ariaLabel?: string
}

/** The provider a hearing choice is on, and those that may be chosen: one that works, or the one chosen. */
function hearingProviders(options: VoiceProviderOption[], shown: ChoiceView | null) {
  const provider = options.find(o => o.providerId === shown?.providerId) ?? options.find(o => o.state === 'works') ?? options[0]
  return { provider, choosable: options.filter(o => o.state === 'works' || o === provider) }
}

/**
 * *Change* for Hearing and the pop-up it opens: the live models of every provider that works, each with its languages
 * and price. The model chosen decides the provider. The row and the AI page's Hearing line both use it.
 */
export function HearingChange({ label, showPrice, options, shown, onChange, buttonText = 'Change', ariaLabel }: ChangeProps) {
  const [changing, setChanging] = useState(false)
  const { provider, choosable } = hearingProviders(options, shown)
  const offered = choosable.flatMap(o => LISTENING_MODELS.filter(m => o.models.includes(m.model)).map(m => ({ ...m, provider: o })))
  return (
    <>
      <button type="button" className={LINK} disabled={!provider} aria-label={ariaLabel} onClick={() => setChanging(true)}>{buttonText}</button>
      {changing && provider && (
        <ListeningDialog
          title={label}
          current={shown?.model ?? null}
          showVia={choosable.length > 1}
          options={offered.map(m => ({ model: m.model, label: `${m.label}, ${m.languages}`, detail: detail(m, showPrice), via: m.provider.name, providerId: m.provider.providerId, quality: m.model === INWORLD_LISTENING_MODEL ? INWORLD_QUALITY_NOTE : null }))}
          onClose={() => setChanging(false)}
          onChoose={o => { setChanging(false); onChange({ providerId: o.providerId, model: o.model }) }}
        />
      )}
    </>
  )
}

/**
 * Hearing: one of the live models of a provider that works (AssemblyAI's three, Inworld's one), each with its
 * languages and price. The model chosen decides the provider, so the one list also switches between them.
 */
export function ListeningRow({ options, own, shown, whom, onChange, label = 'Hearing', showPrice = true }: {
  label?: string
  /** Setup shows no price; the AI page does. */
  showPrice?: boolean
  options: VoiceProviderOption[]
  own: ChoiceView | null
  shown: ChoiceView | null
  whom?: Whom
  onChange: (value: Exclude<VoiceInput, null>) => void
}) {
  const { provider } = hearingProviders(options, shown)
  const current = LISTENING_MODELS.find(m => m.model === shown?.model)
  const hearsOnInworld = shown?.model === INWORLD_LISTENING_MODEL
  const buttonText = whom && !own ? `Give ${whom.agent} its own` : 'Change'
  return (
    <SettingRow
      label={label}
      value={shown
        ? <>{current ? `${current.label}, ${current.languages}` : shown.model}{provider ? ` · via ${provider.name}` : ''}{shown.notWorking ? ' · not working' : ''}{whom && <Whose text={own ? `${whom.agent}'s own` : `${whom.org}'s`} />}</>
        : <span className="text-text-muted">Not chosen</span>}
      hint={!current && !hearsOnInworld ? undefined : <>{current ? detail(current, showPrice) : null}{hearsOnInworld && <span className="block">{INWORLD_QUALITY_NOTE}</span>}</>}
      actions={(
        <>
          <HearingChange label={label} showPrice={showPrice} options={options} shown={shown} onChange={onChange} buttonText={buttonText} />
          {whom && own && <button type="button" className={LINK} onClick={whom.onFollow}>Follow {whom.org}</button>}
        </>
      )}
    />
  )
}
