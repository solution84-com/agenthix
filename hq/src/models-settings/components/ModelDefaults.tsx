import { useAction, getModelsSettings, setModelDefaults, useQuery } from 'wasp/client/operations'
import { ListSummary } from './ListSummary'
import { ModelRows } from './ModelRows'
import { useSaving } from './useSaving'
import { useModelListSaver } from './saveList'

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
      <ModelRows own={data} choices={data.choices} sttOptions={data.stt_options} ttsOptions={data.tts_options}
        onChange={input => void change(input)} />
      <ListSummary title="Which models may run" view={data.list} reachable={data.reachable}
        intro={`For everyone in ${data.orgName}. Agents, projects and people can narrow it further, never widen it.`}
        save={async d => { await saveList(data.list.ownerId, d); await refetch() }} />
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </div>
  )
}
