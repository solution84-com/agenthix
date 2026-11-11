import { useState } from 'react'
import { useQuery, getPlaceSkillFiles } from 'wasp/client/operations'
import { Button, Modal, FIELD as FIELD_LOOK, FOCUS_RING } from '@agenthix/ui/primitives'
import { ChangesList } from '@agenthix/ui/files'
import { useAct } from './useAct'
import { placeSkillChanges, textOf, type SkillFiles } from './placeSkillChanges'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

/** What the dialog is for: reading, or the act it confirms once every file has been shown (L3, FV4). */
export type FilesMode =
  | { kind: 'read' }
  | { kind: 'switchOn'; confirm: (fingerprint: string) => Promise<unknown> }
  | { kind: 'publish'; version: number; confirm: (fingerprint: string, note: string) => Promise<unknown> }
  | { kind: 'putBack'; version: number; confirm: (fingerprint: string) => Promise<unknown> }
  | { kind: 'changes' }

const TITLE = (mode: FilesMode, name: string) => {
  switch (mode.kind) {
    case 'switchOn': return `Switch on ${name}?`
    case 'publish': return `Publish ${name} as version ${mode.version}?`
    case 'putBack': return `Put back version ${mode.version} of ${name}?`
    case 'changes': return `What changed in ${name}`
    default: return name
  }
}

const SAYS: Record<FilesMode['kind'], string> = {
  read: 'These are the files in its folder now.',
  switchOn: 'Agents here will follow these files. This is every file in the folder, as it is now.',
  publish: 'This publishes the files below as they are now, and writes the version into the skill.',
  putBack: "This writes the published version's files over the folder. The files below are what it holds now, and they are replaced.",
  changes: 'Compared with the newest published version.',
}

const CONFIRM: Record<'switchOn' | 'publish' | 'putBack', string> = { switchOn: 'Switch on', publish: 'Publish', putBack: 'Put back' }

export function SkillFilesDialog({ placeSkillId, name, mode, onClose }: {
  placeSkillId: string
  name: string
  mode: FilesMode
  onClose: () => void
}) {
  const { data, error: readError, isLoading } = useQuery(getPlaceSkillFiles, { placeSkillId }, { retry: false })
  const files = data as SkillFiles | undefined
  const { busy, error, run, clear } = useAct()
  const [open, setOpen] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const changes = files && mode.kind === 'changes' ? placeSkillChanges(files) : []

  const confirm = async () => {
    if (mode.kind === 'read' || mode.kind === 'changes' || !files) return
    const done = await run(() => (mode.kind === 'publish' ? mode.confirm(files.fingerprint, note.trim()) : mode.confirm(files.fingerprint)).then(() => true))
    if (done) onClose()
  }

  return (
    <Modal open onClose={onClose} title={TITLE(mode, name)} maxWidth="max-w-2xl">
      <div className="flex max-h-[75vh] flex-col gap-3" data-testid="skill-files-dialog">
        <p className="text-small text-text-secondary">{mode.kind === 'changes' && files && files.newestVersion === null ? 'It has never been published, so every file is new.' : SAYS[mode.kind]}</p>
        {isLoading && <p className="text-small text-text-muted">Reading the files…</p>}
        {readError && <ReadFailure what="The files" error={readError} />}
        {files && mode.kind === 'changes' && (
          changes.length === 0
            ? <p className="text-small text-text-muted">Nothing changed since the newest version.</p>
            : <ChangesList files={changes} />
        )}
        {files && mode.kind !== 'changes' && (
          <ul className="min-h-24 flex-1 divide-y divide-border-subtle overflow-auto rounded-lg border border-border-subtle">
            {files.files.map((f) => {
              const text = textOf(f.base64)
              return (
                <li key={f.path} className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-small text-text-primary">{f.path}</span>
                    <button type="button" className={`rounded text-small text-link hover:underline ${FOCUS_RING}`} aria-expanded={open === f.path} onClick={() => setOpen(open === f.path ? null : f.path)}>
                      {open === f.path ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {open === f.path && (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-surface-2 p-2 font-mono text-small text-text-primary">
                      {text ?? 'A binary file. It is not shown.'}
                    </pre>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {mode.kind === 'publish' && (
          <label className="block text-small font-medium text-text-secondary" htmlFor="place-publish-note">
            Note: what changed, for the history
            <textarea
              id="place-publish-note" value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000}
              className={`mt-1 w-full rounded-lg px-3 py-2 text-body ${FIELD_LOOK}`}
            />
          </label>
        )}
        <ShowAttention text={error} title="The skill was not changed" onClose={clear} />
        <div className="flex shrink-0 justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>{mode.kind === 'read' || mode.kind === 'changes' ? 'Close' : 'Cancel'}</Button>
          {(mode.kind === 'switchOn' || mode.kind === 'publish' || mode.kind === 'putBack') && (
            <Button onClick={confirm} disabled={busy || !files || (mode.kind === 'publish' && note.trim() === '')}>{CONFIRM[mode.kind]}</Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
