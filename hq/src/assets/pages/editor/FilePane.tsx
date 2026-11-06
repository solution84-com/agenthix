import { useState } from 'react'
import { ChangeMarker } from '@agenthix/ui/files'
import { InPlaceChanges } from '../../../shared/fileView/InPlaceChanges'
import { EditFile } from './EditFile'
import { SKILL_FILE_NAME, textOf } from './editorFiles'
import type { EditorState } from './useEditorState'

const ACTION = 'rounded px-2 py-0.5 text-small text-accent hover:bg-surface-hover'
const SWITCH = 'rounded-lg border px-2.5 py-0.5 text-small'
const switchLook = (on: boolean) => `${SWITCH} ${on ? 'border-accent bg-selected text-text-primary' : 'border-border text-text-secondary hover:text-text-primary'}`

/**
 * The open file, ready to write in (board *The editor*): one view, with *Changes* a switch that shows what the draft
 * changes in this file in place, ↑ ↓ between them and *Undo this file's changes*; SKILL.md's *Source* writes it as
 * written instead of as its two fields and body.
 */
export function FilePane({ state, baseLabel }: { state: EditorState; baseLabel: string }) {
  const file = state.current
  const [source, setSource] = useState(false)
  const path = file?.path ?? state.gone?.path ?? null
  const change = path ? state.changes.find(c => c.path === path) ?? null : null
  const baseText = (() => {
    if (!file) return null
    const from = change?.status === 'renamed' ? change.oldPath! : file.path
    const bytes = state.base.find(f => f.path === from)?.bytes
    return bytes ? textOf(bytes) : null
  })()
  const problems = path ? state.checks.filter(c => c.level === 'error' && c.path === path) : []

  return (
    <section className="flex min-h-0 min-w-0 flex-col" aria-label="File">
      {path && !state.showChanges && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border-subtle px-4 py-2">
          <h2 className="min-w-0 flex-1 truncate font-mono text-body text-text-primary">{path}</h2>
          {file?.path === SKILL_FILE_NAME && <button type="button" aria-pressed={source} className={switchLook(source)} onClick={() => setSource(s => !s)}>Source</button>}
          <button type="button" aria-pressed={false} className={switchLook(false)} onClick={() => state.setShowChanges(true)}>Changes</button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        {state.showChanges && path ? (
          change ? (
            <InPlaceChanges
              before={change.before} after={change.after} binary={change.binary}
              heading={<>
                <ChangeMarker status={change.status} />
                <b className="font-mono text-text-primary">{path}</b>
                <span>against {baseLabel}</span>
              </>}
              aside={<>
                <button type="button" className={ACTION} onClick={() => state.undo(change)}>{change.status === 'removed' ? 'Restore' : 'Undo this file’s changes'}</button>
                <button type="button" aria-pressed className={switchLook(true)} onClick={() => state.setShowChanges(false)}>Changes</button>
              </>}
            />
          ) : (
            <div className="flex items-center gap-3 p-4 text-small text-text-secondary" data-testid="editor-changes">
              <span>{path} is the same as in {baseLabel}.</span>
              <button type="button" aria-pressed className={switchLook(true)} onClick={() => state.setShowChanges(false)}>Changes</button>
            </div>
          )
        ) : state.gone ? (
          <div className="flex items-center gap-2 p-4 text-small text-text-secondary">
            <ChangeMarker status="removed" />
            <span>{state.gone.path} is deleted, and stays listed until the skill is published.</span>
            <button type="button" className={ACTION} onClick={() => state.undo(state.gone!)}>Restore</button>
          </div>
        ) : !file ? (
          <p className="p-4 text-small text-text-secondary">Choose a file on the left.</p>
        ) : (
          <div className="p-4"><EditFile file={file} base={change ? baseText : textOf(file.bytes)} problems={problems} whole={source} onChange={state.edit} /></div>
        )}
      </div>
    </section>
  )
}
