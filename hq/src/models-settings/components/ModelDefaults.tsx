import { useAction, getModelsSettings, setModelDefaults, useQuery } from 'wasp/client/operations'
import { ListEditor } from './ListEditor'
import { ModelChoiceRow } from './ModelChoiceRow'
import { VoiceChoiceRow } from './VoiceChoiceRow'
import { useSaving } from './useSaving'
import { useModelListSaver } from './saveList'

const H = 'text-h3 font-semibold text-text-primary'

/** The organisation's defaults and list (models from one place, part 4): organisation admins only. */
export function ModelDefaults() {
  const { data, error: loadError, refetch } = useQuery(getModelsSettings)
  const setDefaults = useAction(setModelDefaults)
  const saveList = useModelListSaver('organisation')
  const { error, run } = useSaving()
  if (loadError) return <p role="alert" className="text-small text-danger">{loadError.message}</p>
  if (!data) return <p className="text-small text-text-muted">Loading…</p>
  const change = (input: Parameters<typeof setDefaults>[0]) => run(async () => { await setDefaults(input); await refetch() })

  return (
    <div className="space-y-8">
      <section aria-label="Defaults">
        <h2 className={H}>Defaults</h2>
        <p className="text-small text-text-secondary">Which model talks and which does the work, for everyone and every agent that sets none of their own.</p>
        <ModelChoiceRow label="Conversation" choices={data.choices} current={data.conversation}
          hint="Where a new conversation starts. People switch from the picker at any time."
          onChange={v => v && void change({ conversation: v })} />
        <ModelChoiceRow label="Workers" choices={data.choices} current={data.worker}
          hint="For work an agent hands off, and its helpers, unless the person's or the task's instruction names another."
          onChange={v => v && void change({ worker: v })} />
      </section>
      <section aria-label="Voice">
        <h2 className={H}>Voice</h2>
        <p className="text-small text-text-secondary">Used by every agent that sets none of its own. Chosen per agent, never per message.</p>
        <VoiceChoiceRow label="Speech to text" kind="stt" options={data.stt_options} current={data.stt}
          hint="Each provider offers its own speech models." onChange={v => v && void change({ stt: v })} />
        <VoiceChoiceRow label="Text to speech" kind="tts" options={data.tts_options} current={data.tts}
          hint="Each provider offers its own models and voices." onChange={v => v && void change({ tts: v })} />
      </section>
      <section aria-label="Which models may run">
        <h2 className={H}>Which models may run</h2>
        <ListEditor view={data.list} reachable={data.reachable}
          intro={`For everyone in ${data.orgName}. Agents, projects and people can narrow it further, never widen it.`}
          save={async d => { await saveList(data.list.ownerId, d); await refetch() }} />
      </section>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </div>
  )
}
