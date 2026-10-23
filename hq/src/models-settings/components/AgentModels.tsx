import { useAction, getAgentModels, setAgentModels, useQuery } from 'wasp/client/operations'
import { ListSummary } from './ListSummary'
import { ModelRows } from './ModelRows'
import { useSaving } from './useSaving'
import { useModelListSaver } from './saveList'

/**
 * An agent's own models, voice and list (models from one place, part 4), on its page in the admin area: the same rows
 * as the organisation's, each saying whose it is. One left as the organisation's follows it when it changes.
 */
export function AgentModels({ agentId, agentName }: { agentId: string; agentName: string }) {
  const { data, error: loadError, refetch } = useQuery(getAgentModels, { agentId })
  const setChoices = useAction(setAgentModels)
  const saveList = useModelListSaver('agent')
  const { error, run } = useSaving()
  if (loadError) return <p role="alert" className="text-small text-danger">{loadError.message}</p>
  if (!data) return <p className="text-small text-text-muted">Loading…</p>
  const change = (input: Omit<Parameters<typeof setChoices>[0], 'agentId'>) => run(async () => { await setChoices({ agentId, ...input }); await refetch() })

  return (
    <div className="space-y-6">
      <ModelRows
        own={data}
        inherited={{ conversation: data.orgConversation, worker: data.orgWorker, stt: data.orgStt, tts: data.orgTts }}
        choices={data.choices} sttOptions={data.stt_options} ttsOptions={data.tts_options}
        who={{ org: data.orgName, agent: agentName }}
        onChange={input => void change(input)} />
      <ListSummary title={`Which models ${agentName} may use`} view={data.list} reachable={data.reachable} above={data.orgName}
        intro={`Narrows ${data.orgName}'s list for ${agentName}, wherever it works.`}
        save={async d => { await saveList(agentId, d); await refetch() }} />
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </div>
  )
}
