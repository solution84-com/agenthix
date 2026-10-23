import { useState } from 'react'
import { Modal } from '@agenthix/ui/primitives'
import type { ListView, ReachableModel } from '../types'
import { ListEditor, type ListDraft } from './ListEditor'
import { LINK, RowsHeading, SettingRow } from './SettingRow'

const models = (n: number) => `${n} ${n === 1 ? 'model' : 'models'}`

/** The list in one line, as the page shows it: what it allows, and what it never allows. */
export function listLine(view: ListView, above?: string): string {
  const allow = view.entries.filter(e => e.effect === 'allow')
  const never = view.entries.filter(e => e.effect === 'never')
  const base = view.mode === 'only_these'
    ? `Only ${allow.length === 0 ? 'nothing yet' : allow.map(e => e.pattern).join(', ')} · ${models(view.allowed)}`
    : `${above ? `Any model ${above} allows` : 'Any model your providers reach'} · ${models(view.allowed)}`
  if (never.length === 0) return base
  const shown = never.slice(0, 2).map(e => e.pattern).join(', ')
  return `${base} · Never: ${shown}${never.length > 2 ? ` and ${never.length - 2} more` : ''}`
}

/**
 * *Which models may run* as one line with *Edit*: the list editor, unchanged, opens in a dialog. Most organisations
 * never open it.
 */
export function ListSummary({ title, view, reachable, above, intro, save }: {
  title: string
  view: ListView
  reachable: readonly ReachableModel[]
  above?: string
  intro: string
  save: (draft: ListDraft) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  return (
    <section aria-label={title}>
      <RowsHeading>{title}</RowsHeading>
      <SettingRow label="Allowed" value={listLine(view, above)}
        actions={<button type="button" className={LINK} onClick={() => setEditing(true)}>Edit</button>} />
      <Modal open={editing} onClose={() => setEditing(false)} title={title} maxWidth="max-w-2xl">
        <div className="max-h-[70vh] overflow-y-auto">
          <ListEditor view={view} reachable={reachable} above={above} intro={intro} save={save} />
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" className={LINK} onClick={() => setEditing(false)}>Done</button>
        </div>
      </Modal>
    </section>
  )
}
