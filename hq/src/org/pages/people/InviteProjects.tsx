import { X } from 'lucide-react'
import { FIELD_BOX, PlainSelect } from '@agenthix/ui/primitives'

export type ProjectChoice = { id: string; key: string; name: string; personalOwnerId: string | null }

/** The projects an invitation joins on accepting: chosen ones as chips in a field, and a select to add another. */
export function InviteProjects({ projects, chosen, onChange }: {
  projects: ProjectChoice[]
  chosen: string[]
  onChange: (ids: string[]) => void
}) {
  const left = projects.filter(p => !chosen.includes(p.id))
  const picked = chosen.map(id => projects.find(p => p.id === id)).filter((p): p is ProjectChoice => !!p)
  return (
    <div className={`flex flex-wrap items-center gap-1.5 rounded-lg ${FIELD_BOX} px-2 py-1.5`}>
      {picked.map(p => (
        <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-chip py-0.5 pl-2.5 pr-1 text-small text-text-primary">
          {p.name}
          <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(chosen.filter(id => id !== p.id))} className="rounded-full p-0.5 text-text-muted hover:text-text-primary">
            <X size={12} />
          </button>
        </span>
      ))}
      {left.length > 0 && (
        <PlainSelect
          aria-label="Add a project" value="" onChange={e => e.target.value && onChange([...chosen, e.target.value])}
          className="min-w-0 flex-1"
        >
          <option value="">Add a project…</option>
          {left.map(p => <option key={p.id} value={p.id}>{p.name} ({p.key})</option>)}
        </PlainSelect>
      )}
      {picked.length === 0 && left.length === 0 && <span className="px-1 text-small text-text-muted">No projects to add</span>}
    </div>
  )
}
