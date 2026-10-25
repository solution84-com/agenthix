import { useState } from 'react'
import { sectionNameProblem } from '@agenthix/core'
import { FILES_BUTTON, FILES_BUTTON_PRIMARY } from '@agenthix/ui/projects'

/** A section exists by holding pages, so a new one is named here and its first page written next. */
export function NewSection({ parent, onCreate, onCancel }: { parent: string; onCreate: (section: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const path = [parent, name.trim().replace(/^\/+|\/+$/g, '')].filter(Boolean).join('/')
  const problem = name.trim() === '' ? null : sectionNameProblem(path)
  return (
    <div role="group" aria-label="New section" className="mx-4 mb-2 rounded-lg border border-border-subtle bg-surface-2 p-3">
      <label className="block text-small text-text-secondary">
        Section name{parent ? ` (inside ${parent})` : ''}
        <input
          value={name} onChange={e => setName(e.target.value)} placeholder="decisions"
          className="mt-1 block w-full rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-body text-text-primary"
        />
      </label>
      <p className="mt-1 text-micro text-text-muted">A section appears once it holds a page: you write its first page next.</p>
      {problem && <p role="alert" className="mt-1 text-small text-danger">{problem}</p>}
      <div className="mt-2 flex gap-2">
        <button type="button" className={FILES_BUTTON_PRIMARY} disabled={name.trim() === '' || !!problem} onClick={() => onCreate(path)}>Write its first page</button>
        <button type="button" className={FILES_BUTTON} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}
