import { useState } from 'react'
import { Button, Input } from '@agenthix/ui/primitives'
import { MODEL_LIST_PATTERN_MAX, type ModelListEffect, type ModelListMode } from '@agenthix/core'
import type { ListEntryView, ListView, ReachableModel } from '../types'
import { BulkSelectDialog } from './BulkSelectDialog'
import { listWords } from './listWords'

export type ListDraft = { mode: ModelListMode; entries: { effect: ModelListEffect; pattern: string }[] }

type Props = {
  view: ListView
  reachable: readonly ReachableModel[]
  /** Whose list sits above this one, for the words: "Fernhill". Absent for the organisation's own. */
  above?: string
  /** What this list narrows, in a line. */
  intro: string
  save: (draft: ListDraft) => Promise<void>
}

const NOTE = 'text-small text-text-muted'

function Entries({ entries, onRemove }: { entries: ListEntryView[]; onRemove: (e: ListEntryView) => void }) {
  return (
    <ul className="divide-y divide-border-subtle">
      {entries.map(e => (
        <li key={`${e.effect}-${e.pattern}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
          <code className="text-body text-text-primary">{e.pattern}</code>
          <span className={`${NOTE} min-w-0 flex-1`}>{e.meaning} · {e.covers} {e.covers === 1 ? 'model' : 'models'}</span>
          <button type="button" className="text-small text-accent hover:text-accent-hover" onClick={() => onRemove(e)} aria-label={`Remove ${e.pattern}`}>Remove</button>
        </li>
      ))}
    </ul>
  )
}

function AddEntry({ effect, onAdd, onBulk }: { effect: ModelListEffect; onAdd: (pattern: string) => void; onBulk: () => void }) {
  const [text, setText] = useState('')
  const add = () => { if (text.trim()) { onAdd(text.trim()); setText('') } }
  return (
    <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); add() }}>
      <Input className="max-w-xs" value={text} maxLength={MODEL_LIST_PATTERN_MAX} onChange={e => setText(e.target.value)}
        placeholder="Add a model or pattern" aria-label={`Add to ${effect === 'never' ? 'Never' : 'Only'}`} />
      <Button type="submit" variant="secondary" size="sm" disabled={!text.trim()}>Add</Button>
      <Button type="button" variant="ghost" size="sm" onClick={onBulk}>Select in bulk…</Button>
    </form>
  )
}

/**
 * The allow and ban list editor, one for every list (models from one place, part 4): *Any model your providers reach,
 * except these* or *Only these*; entries that are a model or a pattern, each saying how many models it covers; and a
 * bulk selection by maker, provider or price. Every change is saved at once. A list only narrows.
 */
export function ListEditor({ view, reachable, above, intro, save }: Props) {
  const [bulk, setBulk] = useState<ModelListEffect | null>(null)
  const [error, setError] = useState('')
  const w = listWords(view, above)
  const only = view.mode === 'only_these'
  const allow = view.entries.filter(e => e.effect === 'allow')
  const never = view.entries.filter(e => e.effect === 'never')
  const draftOf = (mode: ModelListMode, entries: readonly { effect: ModelListEffect; pattern: string }[]): ListDraft =>
    ({ mode, entries: entries.map(e => ({ effect: e.effect, pattern: e.pattern })) })
  const commit = async (draft: ListDraft) => {
    setError('')
    try { await save(draft) } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the list') }
  }
  const add = (effect: ModelListEffect, patterns: string[]) =>
    commit(draftOf(view.mode, [...view.entries, ...patterns.map(pattern => ({ effect, pattern }))]))
  const remove = (e: ListEntryView) => commit(draftOf(view.mode, view.entries.filter(x => !(x.effect === e.effect && x.pattern === e.pattern))))
  const setMode = (mode: ModelListMode) => commit(draftOf(mode, mode === 'every' ? never : view.entries))

  return (
    <div className="space-y-4">
      <p className="text-small text-text-secondary">{intro}</p>
      <fieldset className="space-y-2">
        <legend className="sr-only">Which models may run</legend>
        {(['every', 'only_these'] as const).map(mode => (
          <label key={mode} className="flex items-start gap-2 text-body text-text-primary">
            <input type="radio" name={`mode-${view.owner}-${view.ownerId}`} className="mt-1" checked={view.mode === mode} onChange={() => void setMode(mode)} />
            <span>
              {mode === 'every' ? w.everyLabel : 'Only these'}
              <span className={`${NOTE} block`}>{mode === 'every' ? w.everyCount : w.onlyNote}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {only && (
        <section aria-label="Only">
          <h4 className="text-micro font-medium uppercase tracking-wide text-text-muted">Only</h4>
          <Entries entries={allow} onRemove={e => void remove(e)} />
          {allow.length === 0 && <p className={NOTE}>Nothing is allowed yet, so no model may run. Add a model or a pattern.</p>}
          <AddEntry effect="allow" onAdd={p => void add('allow', [p])} onBulk={() => setBulk('allow')} />
        </section>
      )}
      <section aria-label="Never">
        <h4 className="text-micro font-medium uppercase tracking-wide text-text-muted">Never</h4>
        {only && <p className={NOTE}>Still applies inside Only these: a ban beats an allow.</p>}
        <Entries entries={never} onRemove={e => void remove(e)} />
        <AddEntry effect="never" onAdd={p => void add('never', [p])} onBulk={() => setBulk('never')} />
      </section>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      {bulk && <BulkSelectDialog models={reachable} effect={bulk} onClose={() => setBulk(null)} onAdd={keys => void add(bulk, keys)} />}
    </div>
  )
}
