import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button, FilterSelect, SearchField } from '@agenthix/ui/primitives'
import type { MemoryChoices } from '../../../shared/memory/protocol'
import { placeValue, type MemoryFilter } from '../filters'

type Menu = 'kind' | 'agent' | 'place' | 'tag'

/**
 * The memory list's search and menus. Each menu holds its badge's values ("Every agent", then each agent), so a
 * choice matches the badge exactly. On a phone the menus fold behind one Filter button.
 */
export function MemoryFilters({ filter, onChange, choices, menus = ['kind', 'agent', 'place', 'tag'] }: {
  filter: MemoryFilter
  onChange: (filter: MemoryFilter) => void
  choices: MemoryChoices | undefined
  menus?: Menu[]
}) {
  const [open, setOpen] = useState(false)
  const set = (part: Partial<MemoryFilter>) => onChange({ ...filter, ...part })
  const chosen = menus.filter(m => filter[m] !== '').length
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField label="Search memory" value={filter.words} onChange={words => set({ words })} className="min-w-0 flex-1 sm:max-w-xs" />
      <Button type="button" variant="secondary" className="sm:hidden" aria-expanded={open} onClick={() => setOpen(o => !o)}
        leadingIcon={<SlidersHorizontal size={14} aria-hidden />}>
        {chosen ? `Filter · ${chosen}` : 'Filter'}
      </Button>
      <div className={`flex flex-wrap items-center gap-1 max-sm:w-full ${open ? '' : 'max-sm:hidden'}`}>
        {menus.includes('kind') && (
          <FilterSelect label="Kind" value={filter.kind} onChange={kind => set({ kind: kind as MemoryFilter['kind'] })}>
            <option value="">Any kind</option>
            <option value="FACT">Fact</option>
            <option value="RULE">Rule</option>
          </FilterSelect>
        )}
        {menus.includes('agent') && (
          <FilterSelect label="Agent" value={filter.agent} onChange={agent => set({ agent })}>
            <option value="">Any agent</option>
            <option value="every">Every agent</option>
            {choices?.agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </FilterSelect>
        )}
        {menus.includes('place') && (
          <FilterSelect label="Place" value={filter.place} onChange={place => set({ place })}>
            <option value="">Any place</option>
            <option value="everywhere">Everywhere</option>
            {choices?.places.map(p => <option key={placeValue(p)} value={placeValue(p)}>{p.name}</option>)}
          </FilterSelect>
        )}
        {menus.includes('tag') && (
          <FilterSelect label="Tag" value={filter.tag} onChange={tag => set({ tag })}>
            <option value="">Any tag</option>
            {choices?.tags.map(t => <option key={t} value={t}>{t}</option>)}
          </FilterSelect>
        )}
      </div>
    </div>
  )
}
