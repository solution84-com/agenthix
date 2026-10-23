import { useAction, getAgentModels, setAgentModels, useQuery } from 'wasp/client/operations'
import { ListEditor } from './ListEditor'
import { ModelChoiceRow } from './ModelChoiceRow'
import { VoiceChoiceRow } from './VoiceChoiceRow'
import { useSaving } from './useSaving'
import { useModelListSaver } from './saveList'

const H = 'text-micro font-medium uppercase tracking-wide text-text-muted'

/**
 * An agent's own models, voice and list (models from one place, part 4), on its page in the admin area. They apply
 * before the organisation's defaults; one left as the organisation's follows it when it changes, a named one stays put.
 */
export function AgentModels({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { data, error: loadError, refetch } = useQuery(getAgentModels, { agentId })
  const setChoices = useAction(setAgentModels)
  const saveList = useModelListSaver('agent')
  const { error, run } = useSaving()
  if (loadError) return <p role="alert" className="text-small text-danger">{loadError.message}</p>
  if (!data) return <p className="text-small text-text-muted">Loading…</p>
  const follow = `${data.orgName}'s default`
  const change = (input: Omit<Parameters<typeof setChoices>[0], 'agentId'>) => run(async () => { await setChoices({ agentId, ...input }); await refetch() })
  const following = (label: string, c: { text: string } | null) => (c ? `${follow} · ${c.text}` : label)

  return (
    <div className="space-y-6">
      <p className="text-small text-text-secondary">{agentName} uses these before {data.orgName}&rsquo;s defaults. Leave one as {follow} to follow the organisation.</p>
      <section aria-label="Thinking">
        <h4 className={H}>Thinking</h4>
        <ModelChoiceRow label="Conversation" choices={data.choices} current={data.conversation} followLabel={following(follow, data.orgConversation)}
          hint={`Where a new conversation with ${agentName} starts. People can still switch.`} onChange={v => void change({ conversation: v })} />
        <ModelChoiceRow label="Workers" choices={data.choices} current={data.worker} followLabel={following(follow, data.orgWorker)}
          hint={`For work ${agentName} hands off, unless the person's or the task's instruction names another.`} onChange={v => void change({ worker: v })} />
      </section>
      <section aria-label="Voice">
        <h4 className={H}>Voice</h4>
        <p className="text-small text-text-muted">Every agent has a voice: none is never a choice.</p>
        <VoiceChoiceRow label="Speech to text" kind="stt" options={data.stt_options} current={data.stt} followLabel={following(follow, data.orgStt)}
          hint="" onChange={v => void change({ stt: v })} />
        <VoiceChoiceRow label="Text to speech" kind="tts" options={data.tts_options} current={data.tts} followLabel={following(follow, data.orgTts)}
          hint="" onChange={v => void change({ tts: v })} />
      </section>
      <section aria-label={`Which models ${agentName} may use`}>
        <h4 className={H}>Which models {agentName} may use</h4>
        <ListEditor view={data.list} reachable={data.reachable} above={data.orgName}
          intro={`Narrows ${data.orgName}'s list for ${agentName}, wherever it works.`}
          save={async d => { await saveList(agentId, d); await refetch() }} />
      </section>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </div>
  )
}
