import { useState } from 'react'
import { CodeEditor } from '@agenthix/ui/editor'
import type { ReviewFile } from './changes'
import type { Edits } from './liveChanges'

/** Edit, then accept (board R1): one file at a time in the editor; a file that isn't text is accepted as it is. */
export function ReviewEditor({ files, edits, onEdit }: { files: readonly ReviewFile[]; edits: Edits; onEdit: (path: string, text: string) => void }) {
  const texts = files.filter(f => f.text !== null)
  const [path, setPath] = useState(texts.find(f => f.path === 'SKILL.md')?.path ?? texts[0]?.path ?? '')
  const file = texts.find(f => f.path === path)
  return (
    <div className="rounded-lg border border-border-subtle" data-testid="review-editor">
      <div role="tablist" aria-label="Files" className="flex flex-wrap gap-1 border-b border-border-subtle p-1">
        {texts.map(f => (
          <button
            key={f.path} type="button" role="tab" aria-selected={f.path === path} onClick={() => setPath(f.path)}
            className={`rounded px-2 py-1 font-mono text-small ${f.path === path ? 'bg-selected text-text-primary' : 'text-text-secondary hover:bg-surface-hover'}`}
          >
            {f.path}{edits[f.path] !== undefined && edits[f.path] !== f.text ? ' ●' : ''}
          </button>
        ))}
      </div>
      {file ? (
        <CodeEditor value={edits[file.path] ?? file.text ?? ''} fileName={file.path} label={`Edit ${file.path}`} onChange={text => onEdit(file.path, text)} />
      ) : (
        <p className="p-3 text-small text-text-muted">No text file to edit.</p>
      )}
      {files.some(f => f.text === null) && <p className="border-t border-border-subtle p-2 text-micro text-text-muted">Files that aren't text are accepted as they are.</p>}
    </div>
  )
}
