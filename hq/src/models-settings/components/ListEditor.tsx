import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { ModelListEffect, ModelListMode } from '@agenthix/core'
import { patternMatches } from '../../routing/listMatch'
import { AddModelsButton } from '../../shared/components/models/AddModelsButton'
import type { ListModel } from '../../shared/components/models/modelListLogic'
import type { ListEntryView, ListView, ReachableModel } from '../types'
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
const OFFERED = 'Models your providers reach'

/** A list's reachable models as the model list shows them: the route only for a model two providers reach. */
export const listModelsOf = (reachable: readonly ReachableModel[]): ListModel[] => reachable.map(m => ({
  id: m.key, key: m.key, label: m.label, maker: m.maker, providers: m.via, price: m.price,
  route: m.via.length > 1 ? `via ${m.via.join(', ')}` : null,
}))

/** The entries as chips: a model by its name, a pattern with how many models it covers, each with ✕. */
function Chips({ entries, labelOf, onRemove }: { entries: ListEntryView[]; labelOf: (key: string) => string | undefined; onRemove: (e: ListEntryView) => void }) {
  if (entries.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-1.5">
      {entries.map(e => {
        const name = e.kind === 'model' ? labelOf(e.pattern) : undefined
        return (
          <li key={`${e.effect}-${e.pattern}`} title={`${e.meaning} · ${e.covers} ${e.covers === 1 ? 'model' : 'models'}`}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-1 py-0.5 pl-2.5 pr-1 text-small text-text-primary">
            <span className="min-w-0 truncate">{name ?? <code>{e.pattern}</code>}</span>
            {!name && <span className="shrink-0 text-text-muted">· {e.covers} {e.covers === 1 ? 'model' : 'models'}</span>}
            <button type="button" onClick={() => onRemove(e)} aria-label={`Remove ${e.pattern}`}
              className="flex size-5 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text-primary max-lg:size-8">
              <X size={12} aria-hidden />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The allow and ban list editor, one for every list (models from one place, part 4): *Any model your providers reach,
 * except these* or *Only these*; entries that are a model or a pattern, shown as chips, and *＋ Add models*, which
 * opens the one model list choosing many. Every change is saved at once. A list only narrows.
 */
export function ListEditor({ view, reachable, above, intro, save }: Props) {
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
  const models = useMemo(() => listModelsOf(reachable), [reachable])
  const labels = useMemo(() => new Map(reachable.map(m => [m.key, m.label])), [reachable])
  const adder = (effect: ModelListEffect, entries: readonly ListEntryView[]) => (
    <AddModelsButton models={models} offered={OFFERED} ariaLabel={`Add models to ${effect === 'never' ? 'Never' : 'Only'}`}
      added={m => entries.some(e => patternMatches(e.pattern, m.key ?? m.id))}
      patternAdded={p => entries.some(e => e.pattern.toLowerCase() === p)}
      onAdd={c => void add(effect, [...c.patterns, ...c.models])} />
  )
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
          <div className="mt-2 space-y-2">
            {allow.length === 0 && <p className={NOTE}>Nothing is allowed yet, so no model may run.</p>}
            <Chips entries={allow} labelOf={k => labels.get(k)} onRemove={e => void remove(e)} />
            {adder('allow', allow)}
          </div>
        </section>
      )}
      <section aria-label="Never">
        <h4 className="text-micro font-medium uppercase tracking-wide text-text-muted">Never</h4>
        {only && <p className={NOTE}>Still applies inside Only these: a ban beats an allow.</p>}
        <div className="mt-2 space-y-2">
          <Chips entries={never} labelOf={k => labels.get(k)} onRemove={e => void remove(e)} />
          {adder('never', never)}
        </div>
      </section>
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </div>
  )
}
