import { useMemo, useRef } from 'react'
import { CodeEditor, EDITOR_LIMIT, type LineMark, type LineProblem } from '@agenthix/ui/editor'
import { changedLines } from '../../../shared/fileView/pathTree'
import type { EditorCheck } from './editorChecks'
import { bytesOfText, SKILL_FILE_NAME, textOf, type EditorFile } from './editorFiles'
import { skillMdParts, withSkillMdBody, withSkillMdField, type SkillMdFields } from './skillMdParts'
import { ViewFile } from './ViewFile'
import { Button, FIELD as FIELD_LOOK, BUTTON_SECONDARY } from '@agenthix/ui/primitives'

const FIELD = `mt-1 block w-full rounded-lg px-2.5 py-1.5 text-body ${FIELD_LOOK}`

/** The lines of a part that starts at `first`, renumbered from 1 for the editor that shows only that part. */
function within<T extends { line: number }>(items: readonly T[], first: number, last: number): T[] {
  return items.filter(i => i.line >= first && i.line <= last).map(i => ({ ...i, line: i.line - first + 1 }))
}

function Fields({ fields, problems, onChange }: { fields: SkillMdFields; problems: readonly EditorCheck[]; onChange: (key: keyof SkillMdFields, value: string) => void }) {
  const said = (key: keyof SkillMdFields) => problems.filter(p => p.field === key).map(p => (
    <p key={p.text} role="alert" className="mt-1 text-small text-danger">✕ {p.text}</p>
  ))
  return (
    <div className="mb-3 grid gap-3 rounded-lg border border-border-subtle bg-surface-2 p-3" data-testid="skill-fields">
      <label className="text-small font-medium text-text-secondary">Name
        <input value={fields.name} onChange={e => onChange('name', e.target.value)} className={`${FIELD} font-mono`} />
        {said('name')}
      </label>
      <label className="text-small font-medium text-text-secondary">Description
        <textarea rows={2} value={fields.description} onChange={e => onChange('description', e.target.value)} className={FIELD} />
        {said('description')}
      </label>
    </div>
  )
}

/**
 * A file ready to write in (board *The editor*): text in CodeMirror 6 with the lines the draft changed marked in the
 * margin and each problem written under its line; SKILL.md's name and description as two fields above its body,
 * unless `whole` asks for the file as written. A file that is not text shows as it reads and is replaced by upload;
 * text over 1 MB opens read-only (spec part 6, limits).
 */
export function EditFile({ file, base, problems, whole, onChange }: {
  file: EditorFile
  /** The file's text in the version compared with; null for a new file. */
  base: string | null
  /** The checks' problems in this file. */
  problems: readonly EditorCheck[]
  whole: boolean
  onChange: (file: EditorFile) => void
}) {
  const upload = useRef<HTMLInputElement>(null)
  const text = textOf(file.bytes)
  const marks = useMemo<LineMark[]>(() => (text === null || base === text ? [] : changedLines(base ?? '', text)), [base, text])
  const parts = useMemo(() => (text !== null && file.path === SKILL_FILE_NAME && !whole ? skillMdParts(text) : null), [text, file.path, whole])
  const lineProblems = useMemo<LineProblem[]>(() => problems.filter(p => p.line && !(parts?.fields && p.field)).map(p => ({ line: p.line!, text: p.text })), [problems, parts])

  if (text === null) {
    return (
      <div className="flex flex-col items-start gap-3" data-testid="replace-binary">
        <ViewFile file={file} />
        <p className="text-small text-text-secondary">
          {file.path} is not a text file, so it can’t be written in here. Replace it with another file.
        </p>
        <button type="button" className={`rounded-lg px-3 py-1.5 text-small ${BUTTON_SECONDARY}`} onClick={() => upload.current?.click()}>
          Replace by upload
        </button>
        <input
          ref={upload} type="file" className="hidden" aria-label={`Replace ${file.path}`}
          onChange={async e => {
            const picked = e.target.files?.[0]
            if (picked) onChange({ path: file.path, bytes: new Uint8Array(await picked.arrayBuffer()) })
            e.target.value = ''
          }}
        />
      </div>
    )
  }
  const over = file.bytes.length > EDITOR_LIMIT
  const write = (next: string) => onChange({ path: file.path, bytes: bytesOfText(next) })
  if (parts?.fields) {
    const last = text.split('\n').length
    return (
      <div data-testid="edit-file">
        <Fields fields={parts.fields} problems={problems} onChange={(key, value) => write(withSkillMdField(text, key, value))} />
        <CodeEditor
          value={parts.body} fileName={file.path} label={`Editing ${file.path}`} firstLine={parts.bodyLine}
          marks={within(marks, parts.bodyLine, last)} problems={within(lineProblems, parts.bodyLine, last)}
          readOnly={over} onChange={over ? undefined : body => write(withSkillMdBody(text, body))}
        />
      </div>
    )
  }
  return (
    <div data-testid="edit-file">
      {over && <Button variant="ghost" size="sm" className="mb-2" refusal={{ reason: 'This file is over 1 MB, so it opens read-only.', title: 'This file is read-only', detail: 'This file is over 1 MB, so it opens read-only. Replace it by deleting it and uploading another.' }}>Read-only</Button>}
      <CodeEditor
        value={text} fileName={file.path} label={`Editing ${file.path}`} marks={marks} problems={lineProblems}
        readOnly={over} onChange={over ? undefined : write}
      />
    </div>
  )
}
