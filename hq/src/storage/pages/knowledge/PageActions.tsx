import { useState } from 'react'
import { sectionNameProblem, sectionOfPage } from '@agenthix/core'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'
import { deleteKnowledge, moveKnowledge } from './knowledgeData'
import type { KnowledgeChangeResult, KnowledgeOwner } from './knowledgeTypes'
import { FIELD as FIELD_LOOK } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'

export type PageAction = 'move' | 'delete'

/** What a refused change says: the gate's own words, then what was left untouched. */
export function refusalWords(result: Extract<KnowledgeChangeResult, { outcome: 'refused' }>): string {
  const problems = result.problems?.map(p => p.message).join('; ')
  return problems ? `${result.message} ${problems}` : result.message
}

/** The confirmation of Move and Delete, inline under the page's facts. */
export function PageActions({ owner, page, version, action, sections, onClose, onGone }: {
  owner: KnowledgeOwner
  page: string
  /** The version the page was read at; a move starts from it. */
  version: string | null
  action: PageAction
  sections: string[]
  onClose: () => void
  onGone: (to: string | null) => void
}) {
  const here = sectionOfPage(page)
  const fileName = page.slice(page.lastIndexOf('/') + 1)
  const [section, setSection] = useState(here)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const problem = action === 'move' ? sectionNameProblem(section.trim().replace(/^\/+|\/+$/g, '')) : null
  const target = `${section.trim().replace(/^\/+|\/+$/g, '')}${section.trim() === '' ? '' : '/'}${fileName}`

  const run = async () => {
    setWorking(true)
    setError('')
    try {
      const result = action === 'move'
        ? await moveKnowledge({ owner, from: page, to: target, baseVersion: version ?? '' })
        : await deleteKnowledge({ owner, page })
      if (result.outcome === 'done') onGone(action === 'move' ? target : null)
      else setError(refusalWords(result))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nothing was changed.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div role="group" aria-label={action === 'move' ? 'Move page' : 'Delete page'} className="mt-3 rounded-lg border border-border-subtle bg-surface-2 p-3">
      {action === 'move' ? (
        <label className="block text-small text-text-secondary">
          To another section
          <input
            list="knowledge-sections" value={section} onChange={e => setSection(e.target.value)}
            placeholder="processes/releases (empty for the top)"
            className={`mt-1 block w-full rounded-lg px-3 py-1.5 text-body ${FIELD_LOOK}`}
          />
          <datalist id="knowledge-sections">{sections.map(s => <option key={s} value={s} />)}</datalist>
        </label>
      ) : (
        <p className="text-small text-text-secondary">Delete this page? It is kept for 30 days in Recently deleted, and can be restored from there.</p>
      )}
      {problem && <p role="alert" className="mt-1 text-small text-danger">{problem}</p>}
      {error && <ShowAttention text={error} />}
      <div className="mt-2 flex gap-2">
        <button
          type="button" onClick={() => void run()} className={action === 'move' ? FILES_BUTTON_PRIMARY : `${FILES_BUTTON} text-danger`}
          disabled={working || !!problem || (action === 'move' && (section.trim() === here || version === null))}
        >
          {action === 'move' ? 'Move' : 'Delete page'}
        </button>
        <button type="button" onClick={onClose} className={FILES_BUTTON}>Cancel</button>
      </div>
    </div>
  )
}
