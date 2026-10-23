import type { ModelChoices } from '@agenthix/core'
import type { ModelDefaultsInput } from '../settingsActions'
import type { ChoiceView, VoiceProviderOption } from '../types'
import { ListeningRow } from './ListeningRow'
import { ModelChoiceRow, type Whom } from './ModelChoiceRow'
import { RowsHeading } from './SettingRow'
import { VoiceRow } from './VoiceRow'

type Four = { conversation: ChoiceView | null; worker: ChoiceView | null; stt: ChoiceView | null; tts: ChoiceView | null }

/**
 * The four settings, as one short list: Thinking (Conversation, Workers) and Voice (Voice, then Listening). On the
 * organisation's page `own` is what is set and nothing is inherited; on an agent's page `inherited` is the
 * organisation's, shown until the agent has its own, and `agent`/`org` say whose each row is.
 */
export function ModelRows({ own, inherited, choices, sttOptions, ttsOptions, who, onChange }: {
  own: Four
  inherited?: Four
  choices: ModelChoices | undefined
  sttOptions: VoiceProviderOption[]
  ttsOptions: VoiceProviderOption[]
  who?: { org: string; agent: string }
  onChange: (input: ModelDefaultsInput) => void
}) {
  const shown = (slot: keyof Four) => own[slot] ?? inherited?.[slot] ?? null
  const whom = (slot: keyof Four): Whom | undefined => who && { ...who, onFollow: () => onChange({ [slot]: null }) }
  return (
    <div className="space-y-6">
      <section aria-label="Thinking">
        <RowsHeading>Thinking</RowsHeading>
        <ModelChoiceRow label="Conversation" hint={who ? `Where a new conversation with ${who.agent} starts` : 'Where a new conversation starts'}
          choices={choices} own={own.conversation} shown={shown('conversation')} whom={whom('conversation')} onChange={v => onChange({ conversation: v })} />
        <ModelChoiceRow label="Workers" hint={who ? `Work ${who.agent} hands off` : 'Work an agent hands off'}
          choices={choices} own={own.worker} shown={shown('worker')} whom={whom('worker')} onChange={v => onChange({ worker: v })} />
      </section>
      <section aria-label="Voice">
        <RowsHeading>Voice</RowsHeading>
        <VoiceRow options={ttsOptions} own={own.tts} shown={shown('tts')} whom={whom('tts')} onChange={v => onChange({ tts: v })} />
        <ListeningRow options={sttOptions} own={own.stt} shown={shown('stt')} whom={whom('stt')} onChange={v => onChange({ stt: v })} />
      </section>
    </div>
  )
}
