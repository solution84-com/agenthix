import type { ModelChoices } from '@agenthix/core'
import type { ModelDefaultsInput } from '../settingsActions'
import type { ChoiceView, VoiceProviderOption } from '../types'
import { ListeningRow } from './ListeningRow'
import { ModelChoiceRow, type Whom } from './ModelChoiceRow'
import { RowsHeading, SettingRow } from './SettingRow'
import { VoiceRow } from './VoiceRow'

type Three = { conversation: ChoiceView | null; stt: ChoiceView | null; tts: ChoiceView | null }

/**
 * The three settings, as one short list: Thinking (the one default model, for a conversation and the work it hands
 * off) and Voice (Voice, then Listening). On the
 * organisation's page `own` is what is set and nothing is inherited; on an agent's page `inherited` is the
 * organisation's, shown until the agent has its own, and `agent`/`org` say whose each row is.
 */
export function ModelRows({ own, inherited, choices, sttOptions, ttsOptions, who, labels, unset, showPrice, onChange }: {
  own: Three
  inherited?: Three
  choices: ModelChoices | undefined
  sttOptions: VoiceProviderOption[]
  ttsOptions: VoiceProviderOption[]
  who?: { org: string; agent: string }
  /** Other names for the voice and listening rows (setup says Speaking and Hearing). */
  labels?: { tts?: string; stt?: string }
  /** A setting nothing can serve: shown as this line, without a way to change it. */
  unset?: Partial<Record<keyof Three, string>>
  /** False on setup, which shows no price; default true. */
  showPrice?: boolean
  onChange: (input: ModelDefaultsInput) => void
}) {
  const shown = (slot: keyof Three) => own[slot] ?? inherited?.[slot] ?? null
  const whom = (slot: keyof Three): Whom | undefined => who && { ...who, orgChoice: inherited?.[slot], onFollow: () => onChange({ [slot]: null }) }
  const none = (label: string, line: string) => <SettingRow label={label} value={<span className="text-text-muted">{line}</span>} actions={null} />
  return (
    <div className="space-y-6">
      <section aria-label="Thinking">
        <RowsHeading>Thinking</RowsHeading>
        {unset?.conversation ? none('Model', unset.conversation) : <ModelChoiceRow label="Model" hint={who ? `A new conversation with ${who.agent} and the work it hands off` : 'A new conversation and the work it hands off'}
          choices={choices} own={own.conversation} shown={shown('conversation')} whom={whom('conversation')} onChange={v => onChange({ conversation: v })} />}
      </section>
      <section aria-label="Voice">
        <RowsHeading>Voice</RowsHeading>
        {unset?.tts ? none(labels?.tts ?? 'Voice', unset.tts) : <VoiceRow label={labels?.tts} options={ttsOptions} own={own.tts} shown={shown('tts')} whom={whom('tts')} onChange={v => onChange({ tts: v })} />}
        {unset?.stt ? none(labels?.stt ?? 'Listening', unset.stt) : <ListeningRow label={labels?.stt} showPrice={showPrice} options={sttOptions} own={own.stt} shown={shown('stt')} whom={whom('stt')} onChange={v => onChange({ stt: v })} />}
      </section>
    </div>
  )
}
