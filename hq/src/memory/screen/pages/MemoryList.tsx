import { useState } from 'react'
import { useQuery, useAction, getMemory, saveMemoryItem, setMemoryPinned, forgetMemoryItem } from 'wasp/client/operations'
import type { GetMemoryArgs, MemoryItemView } from '../../../shared/memory/protocol'
import { MemoryEditor, draftOf } from './MemoryEditor'
import { useMarkedItem } from '../../../shared/hooks/useMarkedItem'
import { KIND_LABELS, hitsText, lastRecalledText } from './memoryFormat'
import { ShowAttention } from '@agenthix/ui/attention'

type ScopeArgs = Omit<GetMemoryArgs, 'includeArchived'>

const LINK = 'text-small text-text-secondary hover:text-text-primary cursor-pointer'

function ItemCard({ item, marked, onEdit, onPin, onForget }: {
  item: MemoryItemView; marked: ReturnType<ReturnType<typeof useMarkedItem>['markOf']>; onEdit: () => void; onPin: () => void; onForget: () => void
}) {
  return (
    <li {...marked} className={`bg-surface-1 border border-border rounded-xl p-4 ${item.archived ? 'opacity-40' : ''} ${marked.className ?? ''}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-body font-medium text-text-primary">
            {item.title}
            {item.pinned && <span className="ml-2 text-micro font-medium uppercase text-text-secondary">Pinned</span>}
            {item.archived && <span className="ml-2 text-micro font-medium uppercase text-text-muted">Archived</span>}
          </h3>
          <p className="mt-1 whitespace-pre-wrap text-body text-text-primary">{item.body}</p>
          <p className="mt-2 text-small text-text-muted">
            {KIND_LABELS[item.kind]}
            {item.tags.length > 0 && ` · ${item.tags.join(', ')}`}
            {` · ${lastRecalledText(item.lastRecalledAt)} · ${hitsText(item.recallCount, item.usedCount)}`}
            {item.writtenBy && ` · Written by ${item.writtenBy}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button type="button" onClick={onPin} className={LINK}>{item.pinned ? 'Unpin' : 'Pin'}</button>
          <button type="button" onClick={onEdit} className={LINK}>Edit</button>
          <button type="button" onClick={onForget} className="text-small text-danger cursor-pointer">Delete</button>
        </div>
      </div>
    </li>
  )
}

/** One scope's memory: what is held, with the controls to add, edit, pin and delete (archived on request). */
export function MemoryList({ scope }: { scope: ScopeArgs }) {
  const [showArchived, setShowArchived] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const { data: items, isLoading } = useQuery(getMemory, { ...scope, includeArchived: showArchived })
  const { markOf } = useMarkedItem('memory')
  const save = useAction(saveMemoryItem)
  const pin = useAction(setMemoryPinned)
  const forget = useAction(forgetMemoryItem)

  async function run(work: () => Promise<unknown>) {
    setProblem(null)
    try {
      await work()
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err))
      throw err
    }
  }
  const quietly = (work: () => Promise<unknown>) => run(work).catch(() => undefined)

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-body text-text-muted">Loading…</p>
      ) : !items?.length ? (
        <p className="text-body text-text-muted">Nothing is remembered here yet.</p>
      ) : (
        <ul className="space-y-3">
          {items.map(item => editingId === item.id ? (
            <li key={item.id} className="bg-surface-1 border border-border rounded-xl p-4">
              <MemoryEditor initial={draftOf(item)} submitLabel="Save" onCancel={() => setEditingId(null)}
                onSave={draft => run(async () => { await save({ ...scope, id: item.id, ...draft }); setEditingId(null) }).catch(() => undefined)} />
            </li>
          ) : (
            <ItemCard key={item.id} item={item} marked={markOf(item.key)} onEdit={() => setEditingId(item.id)}
              onPin={() => quietly(() => pin({ id: item.id, pinned: !item.pinned }))}
              onForget={() => quietly(async () => {
                const result = await forget({ id: item.id })
                if (!result.ok) throw new Error('That memory is already gone.')
              })} />
          ))}
        </ul>
      )}

      <label className="flex items-center gap-2 text-small text-text-secondary">
        <input className="accent-accent" type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
        Show archived
      </label>

      <div className="bg-surface-1 border border-border rounded-xl p-4">
        <h3 className="mb-2 text-body font-medium text-text-primary">Add a memory</h3>
        <MemoryEditor initial={draftOf()} submitLabel="Add"
          onSave={draft => quietly(() => save({ ...scope, ...draft }))} />
      </div>
      <ShowAttention text={problem} title="The memory was not changed" onClose={() => setProblem(null)} />
    </div>
  )
}
