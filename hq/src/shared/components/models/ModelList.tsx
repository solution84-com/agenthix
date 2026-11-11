import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Button, FOCUS_RING } from '@agenthix/ui/primitives'
import {
  NO_FILTER, PRICE_BANDS, addWords, filterModels, groupModels, isFiltered, makersOf, patternFor, providersOf,
  type ListFilter, type ListModel, type PatternRow,
} from './modelListLogic'
import { moveHighlight } from './modelPickerLogic'
import { PlainSelect } from '@agenthix/ui/primitives'
import { ListRow, MakerHeading, PriceMarks, modelUnder } from './ModelRow'

/** The first row where the place has a default to fall back on: *Default · the model*, with who set it under it. */
export type DefaultRow = {
  /** The model's name; absent when the place cannot say which model it is. */
  model?: string
  setBy: string
  /** The row's own words in place of *Default · the model*, where the first row is not a default: the playground's fake model. */
  label?: string
  /** The line under it in place of *set by …*. */
  under?: string
  /** What choosing it gives back. */
  value: string
}

type Common = {
  models: readonly ListModel[]
  /** The line at the foot: which models are offered here, and why. */
  offered: string
  onClose: () => void
}
export type ChooseOne = Common & { mode: 'one'; value: string; defaultRow?: DefaultRow; onChoose: (id: string) => void }
export type ChooseMany = Common & {
  mode: 'many'
  /** Whether a model is already in the place's list, so its row reads *Added*. */
  added: (m: ListModel) => boolean
  patternAdded: (pattern: string) => boolean
  onAdd: (chosen: { models: string[]; patterns: string[] }) => void
}

type Item = { kind: 'default' } | { kind: 'pattern'; row: PatternRow } | { kind: 'model'; m: ListModel }

/**
 * The one model list, inside every place a model is chosen: search, the maker, provider and price filters, the
 * place's default first, then the models grouped by maker, each with its price marks. Choosing one, a click chooses
 * and closes; choosing many, each row takes a tick, what is typed can be added as a pattern, and *Add* at the foot
 * adds them all. It never lists what the place has chosen: rows say their own state, the place shows the rest.
 */
export function ModelList(props: ChooseOne | ChooseMany) {
  const { models, offered, onClose } = props
  const many = props.mode === 'many'
  const [filter, setFilter] = useState<ListFilter>(NO_FILTER)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set())
  const [patterns, setPatterns] = useState<ReadonlySet<string>>(new Set())
  const [highlight, setHighlight] = useState(0)
  const search = useRef<HTMLInputElement>(null)
  const listId = useId()

  const found = useMemo(() => filterModels(models, filter), [models, filter])
  const groups = useMemo(() => groupModels(found, isFiltered(filter), expanded), [found, filter, expanded])
  const pattern = many ? patternFor(filter.query, models) : null
  const defaultRow = !many && filter.query.trim() === '' ? props.defaultRow : undefined
  const items: Item[] = [
    ...(defaultRow ? [{ kind: 'default' } as const] : []),
    ...(pattern ? [{ kind: 'pattern', row: pattern } as const] : []),
    ...groups.flatMap(g => g.shown.map(m => ({ kind: 'model', m }) as const)),
  ]

  useEffect(() => { search.current?.focus() }, [])
  useEffect(() => { setHighlight(0) }, [filter])

  const isAdded = (item: Item) =>
    many && (item.kind === 'model' ? props.added(item.m) : item.kind === 'pattern' && props.patternAdded(item.row.pattern))
  const pickable = (item: Item) => !(item.kind === 'model' && item.m.notWorking) && !isAdded(item)
  const toggle = (set: ReadonlySet<string>, key: string) => { const next = new Set(set); if (!next.delete(key)) next.add(key); return next }
  const pick = (item: Item) => {
    if (!pickable(item)) return
    if (props.mode === 'one') {
      props.onChoose(item.kind === 'default' ? props.defaultRow!.value : item.kind === 'model' ? item.m.id : '')
      onClose()
    } else if (item.kind === 'model') setTicked(s => toggle(s, item.m.id))
    else if (item.kind === 'pattern') setPatterns(s => toggle(s, item.row.pattern))
  }
  const isTicked = (item: Item) => {
    if (isAdded(item)) return true
    if (props.mode === 'many') return item.kind === 'model' ? ticked.has(item.m.id) : item.kind === 'pattern' && patterns.has(item.row.pattern)
    const onDefault = props.defaultRow !== undefined && props.value === props.defaultRow.value
    return item.kind === 'default' ? onDefault : item.kind === 'model' && !onDefault && item.m.id === props.value
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
    // The keys walk the rows from the search field; in a filter they keep their own meaning.
    if (e.target !== search.current) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => moveHighlight(h, e.key as 'ArrowDown' | 'ArrowUp', items.length)) }
    else if (e.key === 'Enter') { e.preventDefault(); const item = items[highlight]; if (item) pick(item) }
  }
  const optionId = (i: number) => `${listId}-${i}`
  const set = (change: Partial<ListFilter>) => setFilter(f => ({ ...f, ...change }))
  const added = <span className="shrink-0 text-small text-text-muted">Added</span>

  const row = (item: Item, i: number) => {
    const common = {
      id: optionId(i), ticked: isTicked(item), pickable: pickable(item), highlighted: i === highlight,
      onHover: () => setHighlight(i), onPick: () => pick(item),
    }
    if (item.kind === 'default') {
      const d = defaultRow!
      return <ListRow key="default" {...common} title={d.label ?? (d.model ? `Default · ${d.model}` : 'Default')} under={d.under ?? `set by ${d.setBy}`} />
    }
    if (item.kind === 'pattern') {
      return (
        <ListRow key="pattern" {...common} title={<>＋ Add the pattern <code>{item.row.pattern}</code></>}
          under={`covers ${item.row.covers} ${item.row.covers === 1 ? 'model' : 'models'}`} end={isAdded(item) ? added : undefined} />
      )
    }
    return (
      <ListRow key={item.m.id} {...common} dim={item.m.notWorking} title={item.m.label} under={modelUnder(item.m)}
        end={isAdded(item) ? added : <PriceMarks price={item.m.price} />} />
    )
  }

  let at = (defaultRow ? 1 : 0) + (pattern ? 1 : 0)
  const chosen = ticked.size + patterns.size

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
        <Search size={14} aria-hidden className="shrink-0 text-text-muted" />
        <input
          ref={search}
          value={filter.query}
          onChange={e => set({ query: e.target.value })}
          placeholder="Search models"
          aria-label="Search models"
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={items.length ? optionId(highlight) : undefined}
          className="min-w-0 flex-1 bg-transparent text-body text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        <span className="shrink-0 rounded border border-border px-1 text-micro text-text-muted max-lg:hidden">esc</span>
      </div>
      <div className="flex gap-1.5 border-b border-border-subtle px-3 py-1.5">
        <PlainSelect className="min-w-0 flex-1" aria-label="Maker" value={filter.maker} onChange={e => set({ maker: e.target.value })}>
          <option value="">Maker</option>
          {makersOf(models).map(m => <option key={m}>{m}</option>)}
        </PlainSelect>
        <PlainSelect className="min-w-0 flex-1" aria-label="Provider" value={filter.provider} onChange={e => set({ provider: e.target.value })}>
          <option value="">Provider</option>
          {providersOf(models).map(p => <option key={p}>{p}</option>)}
        </PlainSelect>
        <PlainSelect className="min-w-0 flex-1" aria-label="Price" value={filter.price} onChange={e => set({ price: Number(e.target.value) as ListFilter['price'] })}>
          {PRICE_BANDS.map(b => <option key={b.value} value={b.value}>{b.value === 0 ? 'Price' : b.label}</option>)}
        </PlainSelect>
      </div>
      <ul id={listId} role="listbox" aria-label="Models" aria-multiselectable={many || undefined} className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {items.slice(0, at).map((item, i) => row(item, i))}
        {groups.map(g => (
          <li key={g.maker} role="presentation">
            <MakerHeading maker={g.maker} />
            <ul role="presentation">
              {g.shown.map(m => { const i = at++; return row({ kind: 'model', m }, i) })}
            </ul>
            {g.hidden > 0 && (
              <button type="button" onClick={() => setExpanded(s => new Set(s).add(g.maker))}
                className={`rounded px-2 py-1 pl-8 text-small text-link hover:underline max-lg:min-h-10 ${FOCUS_RING}`}>
                Show {g.hidden} more {g.maker}
              </button>
            )}
          </li>
        ))}
        {found.length === 0 && !pattern && (
          <li role="presentation" className="px-2 py-3 text-small text-text-muted">
            {filter.query.trim() ? `No model matches “${filter.query.trim()}”.` : 'No model matches these filters.'}
          </li>
        )}
      </ul>
      {props.mode === 'many' && (
        <div className="flex items-center gap-2 border-t border-border-subtle px-3 py-2">
          <span className="min-w-0 flex-1 text-small text-text-muted">{chosen} chosen</span>
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" size="sm" disabled={chosen === 0}
            onClick={() => { props.onAdd({ models: [...ticked], patterns: [...patterns] }); onClose() }}>
            {chosen === 0 ? 'Add models' : addWords(ticked.size, patterns.size)}
          </Button>
        </div>
      )}
      <p className="border-t border-border-subtle px-3 py-2 text-small text-text-muted">{offered}</p>
    </div>
  )
}
