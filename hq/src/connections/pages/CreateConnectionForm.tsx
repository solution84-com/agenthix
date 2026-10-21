import { useState, type FormEvent } from 'react'
import { createConnection } from 'wasp/client/operations'
import { Button, FormField, Input, NativeSelect } from '@agenthix/ui/primitives'
import {
  CONNECTION_EXPIRY_DAYS, CONNECTION_GROUPS, CONNECTION_GROUP_INFO, DEFAULT_CONNECTION_EXPIRY_DAYS,
  type ConnectionGroup, type ConnectionView,
} from '../../shared/connections'

interface Props {
  /** The projects the person can reach — the only ones a connection can be limited to. */
  projects: { id: string; name: string }[]
  onCreated: (result: { token: string; connection: ConnectionView }) => void
  onCancel: () => void
}

const DEFAULT_GROUPS = CONNECTION_GROUPS.filter(g => CONNECTION_GROUP_INFO[g].defaultOn)

export function CreateConnectionForm({ projects, onCreated, onCancel }: Props) {
  const [name, setName] = useState('')
  const [groups, setGroups] = useState<Set<ConnectionGroup>>(new Set(DEFAULT_GROUPS))
  const [allProjects, setAllProjects] = useState(true)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [days, setDays] = useState<number>(DEFAULT_CONNECTION_EXPIRY_DAYS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    return next
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await createConnection({
        name,
        groups: [...groups],
        projectIds: allProjects ? null : [...chosen],
        expiresInDays: days,
      })
      onCreated(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the connection')
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = name.trim() !== '' && groups.size > 0 && (allProjects || chosen.size > 0) && !busy

  return (
    <form onSubmit={submit} className="bg-surface-1 border border-border rounded-xl p-6 space-y-5">
      <FormField label="Name" htmlFor="connection-name" hint="What uses it — a tool, or a project.">
        <Input id="connection-name" value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Claude Code on my laptop" />
      </FormField>

      <FormField label="Permissions" hint="Each only narrows what you can do yourself.">
        <div className="space-y-2">
          {CONNECTION_GROUPS.map(g => (
            <label key={g} className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 accent-accent"
                checked={groups.has(g)}
                onChange={() => setGroups(toggle(groups, g))}
              />
              <span>
                <span className="block text-body text-text-primary">{CONNECTION_GROUP_INFO[g].label}</span>
                <span className="block text-small text-text-muted">{CONNECTION_GROUP_INFO[g].covers}</span>
              </span>
            </label>
          ))}
          {groups.has('start_work') && (
            <p className="text-small text-warning">Work this connection starts counts as started by you.</p>
          )}
        </div>
      </FormField>

      <FormField label="Projects">
        <div className="space-y-2">
          <label className="flex items-center gap-2.5 cursor-pointer text-body text-text-primary">
            <input type="radio" className="accent-accent" checked={allProjects} onChange={() => setAllProjects(true)} />
            All my projects
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer text-body text-text-primary">
            <input type="radio" className="accent-accent" checked={!allProjects} onChange={() => setAllProjects(false)} />
            Only these
          </label>
          {!allProjects && (
            <div className="ml-6 max-h-48 overflow-y-auto space-y-1.5 border border-border rounded-lg p-3">
              {projects.length === 0 && <p className="text-small text-text-muted">You are not a member of any project.</p>}
              {projects.map(p => (
                <label key={p.id} className="flex items-center gap-2.5 cursor-pointer text-body text-text-secondary">
                  <input type="checkbox" className="accent-accent" checked={chosen.has(p.id)} onChange={() => setChosen(toggle(chosen, p.id))} />
                  {p.name}
                </label>
              ))}
            </div>
          )}
        </div>
      </FormField>

      <FormField label="Expires after" htmlFor="connection-expiry">
        <NativeSelect id="connection-expiry" value={days} onChange={e => setDays(Number(e.target.value))} className="max-w-[200px]">
          {CONNECTION_EXPIRY_DAYS.map(d => <option key={d} value={d}>{d} days</option>)}
        </NativeSelect>
      </FormField>

      {error && <p className="text-body text-danger">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={!canSubmit}>{busy ? 'Creating…' : 'Create connection'}</Button>
      </div>
    </form>
  )
}
