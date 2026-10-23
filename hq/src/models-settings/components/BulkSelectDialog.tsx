import { useMemo, useState } from 'react'
import { Button, Input, Modal, NativeSelect } from '@agenthix/ui/primitives'
import type { ModelListEffect } from '@agenthix/core'
import type { ReachableModel } from '../types'
import { NO_FILTER, PRICE_BANDS, filterModels, makersOf, providersOf, type BulkFilter } from './bulkSelect'

/**
 * Select models in bulk (models from one place, part 4): filter by maker, provider or price band, and add the models
 * found to the list by name. A one-time selection the person sees and confirms: if prices change later, the list does not.
 */
export function BulkSelectDialog({ models, effect, onClose, onAdd }: {
  models: readonly ReachableModel[]
  effect: ModelListEffect
  onClose: () => void
  onAdd: (keys: string[]) => void
}) {
  const [filter, setFilter] = useState<BulkFilter>(NO_FILTER)
  const found = useMemo(() => filterModels(models, filter), [models, filter])
  const set = (change: Partial<BulkFilter>) => setFilter(f => ({ ...f, ...change }))
  const verb = effect === 'never' ? `Never use these ${found.length}` : `Allow these ${found.length}`

  return (
    <Modal open onClose={onClose} title="Select models in bulk">
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-small text-text-muted">Maker
            <NativeSelect value={filter.maker} onChange={e => set({ maker: e.target.value })}>
              <option value="">Any</option>
              {makersOf(models).map(m => <option key={m}>{m}</option>)}
            </NativeSelect>
          </label>
          <label className="text-small text-text-muted">Provider
            <NativeSelect value={filter.provider} onChange={e => set({ provider: e.target.value })}>
              <option value="">Any</option>
              {providersOf(models).map(p => <option key={p}>{p}</option>)}
            </NativeSelect>
          </label>
          <label className="text-small text-text-muted">Price
            <NativeSelect value={filter.minPrice} onChange={e => set({ minPrice: Number(e.target.value) as BulkFilter['minPrice'] })}>
              {PRICE_BANDS.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </NativeSelect>
          </label>
        </div>
        <Input value={filter.search} onChange={e => set({ search: e.target.value })} placeholder="Search…" aria-label="Search models" />
        <ul aria-label="Models found" className="max-h-56 space-y-1 overflow-y-auto text-small">
          {found.slice(0, 50).map(m => (
            <li key={m.key} className="flex justify-between gap-2">
              <span className="text-text-primary">{m.label}</span>
              <span className="text-text-muted">via {m.via.join(', ')} · {'$'.repeat(m.price)}</span>
            </li>
          ))}
          {found.length > 50 && <li className="text-text-muted">… {found.length - 50} more</li>}
          {found.length === 0 && <li className="text-text-muted">No model matches.</li>}
        </ul>
        <p className="text-small text-text-muted">
          {found.length} models selected. Adding them puts each one on the list by name: if prices change later, the list does not.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="button" variant={effect === 'never' ? 'danger' : 'primary'} disabled={found.length === 0} onClick={() => { onAdd(found.map(m => m.key)); onClose() }}>
            {verb}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
