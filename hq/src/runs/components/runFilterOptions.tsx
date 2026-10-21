import { useQuery, getProjects, getAgents } from 'wasp/client/operations'
import { FilterSelect } from '@agenthix/ui/primitives'

type Named = { id: string; name: string; key?: string }

/** "Any place" and each project the person is in. */
export function PlaceFilter({ value, onChange }: { value: string; onChange: (place: string | undefined) => void }) {
  const { data } = useQuery(getProjects)
  const projects = (data ?? []).filter((p) => p.key)
  return (
    <FilterSelect label="Place" value={value} onChange={(v) => onChange(v || undefined)}>
      <option value="">Any place</option>
      {projects.map((p) => <option key={p.id} value={p.key}>{p.name}</option>)}
    </FilterSelect>
  )
}

export function AgentFilter({ value, onChange }: { value: string; onChange: (agentId: string | undefined) => void }) {
  const { data } = useQuery(getAgents)
  const agents = data ?? []
  return (
    <FilterSelect label="Agent" value={value} onChange={(v) => onChange(v || undefined)}>
      <option value="">Any agent</option>
      {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </FilterSelect>
  )
}
