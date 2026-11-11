import { useMemo, useState } from 'react'
import { useQuery, getLibraryAssets, addSkillToPlace } from 'wasp/client/operations'
import { Button, Modal, SearchField, ROW_CHOSEN, ROW_ITEM } from '@agenthix/ui/primitives'
import type { LibraryAssets } from '../../../library/assetList/types'
import { useAct } from './useAct'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * *Add to this place* (F3): copies an installed skill into the place's folder, or one agent's. Only what is already
 * installed is offered here; installing something new from outside is the Library's.
 */
export function AddToPlaceDialog({ projectId, placeName, agents, onClose }: {
  projectId: string
  placeName: string
  agents: { id: string; name: string }[]
  onClose: () => void
}) {
  const { data } = useQuery(getLibraryAssets)
  const [search, setSearch] = useState('')
  const [assetId, setAssetId] = useState<string | null>(null)
  const [agentId, setAgentId] = useState<string>('')
  const { busy, error, run, clear } = useAct()
  const rows = useMemo(() => {
    const all = (data as LibraryAssets | undefined)?.rows ?? []
    const q = search.trim().toLowerCase()
    return all.filter((r) => r.kind === 'skill' && r.assetId && !r.builtIn && !r.statuses.includes('setAside')
      && (!q || `${r.title} ${r.identity} ${r.description}`.toLowerCase().includes(q)))
  }, [data, search])
  const add = async () => {
    if (!assetId) return
    const done = await run(() => addSkillToPlace({ projectId, assetId, agentId: agentId || undefined }).then(() => true))
    if (done) onClose()
  }
  return (
    <Modal open onClose={onClose} title="Add to this place" maxWidth="max-w-xl">
      <div className="space-y-3" data-testid="add-to-place-dialog">
        <p className="text-small text-text-secondary">Copies a skill the organisation has installed into {placeName}'s files. It arrives as its first version there.</p>
        <SearchField label="Search the Library" value={search} onChange={setSearch} placeholder="Search the Library…" />
        <div role="radiogroup" aria-label="Installed skills" className="max-h-64 divide-y divide-border-subtle overflow-auto rounded-lg border border-border-subtle">
          {rows.length === 0 && <p className="px-3 py-3 text-small text-text-muted">No installed skill matches.</p>}
          {rows.map((r) => (
            <label key={r.key} className={`flex cursor-pointer items-start gap-2 px-3 py-2 ${assetId === r.assetId ? ROW_CHOSEN : ROW_ITEM}`}>
              <input type="radio" name="add-skill" className="accent-accent mt-1" checked={assetId === r.assetId} onChange={() => setAssetId(r.assetId)} />
              <span className="min-w-0">
                <span className="block text-body text-text-primary">{r.title} <span className="text-small text-text-muted">{r.version ? `${r.identity} · ${r.version}` : r.identity}</span></span>
                {r.description && <span className="block text-small text-text-secondary">{r.description}</span>}
              </span>
            </label>
          ))}
        </div>
        <fieldset className="space-y-1">
          <legend className="text-small font-medium text-text-primary">Add for</legend>
          <label className="flex items-center gap-2 text-body text-text-primary">
            <input type="radio" className="accent-accent" name="add-for" checked={agentId === ''} onChange={() => setAgentId('')} /> Every agent in this place
          </label>
          {agents.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-body text-text-primary">
              <input type="radio" className="accent-accent" name="add-for" checked={agentId === a.id} onChange={() => setAgentId(a.id)} /> One agent: {a.name}
            </label>
          ))}
        </fieldset>
        <ShowAttention kind="alert" text={error} title="It was not added" onClose={clear} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={add} disabled={busy || !assetId}>Add</Button>
        </div>
      </div>
    </Modal>
  )
}
