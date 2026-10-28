import { useRef } from 'react'
import { CodeEditor, EDITOR_LIMIT } from '@agenthix/ui/editor'
import { bytesOfText, SKILL_FILE_NAME, textOf, type EditorFile } from './editorFiles'

/**
 * Edit (board U3b, E3): a text file in CodeMirror 6; a binary file, which is not edited, is replaced by upload; text over
 * 1 MB opens read-only (spec part 6, limits).
 */
export function EditFile({ file, onChange }: { file: EditorFile; onChange: (file: EditorFile) => void }) {
  const upload = useRef<HTMLInputElement>(null)
  const text = textOf(file.bytes)

  if (text === null) {
    return (
      <div className="flex flex-col items-start gap-2" data-testid="replace-binary">
        <p className="text-small text-text-secondary">
          {file.path} is not a text file ({file.bytes.length.toLocaleString('en-GB')} bytes), so it can’t be edited here. Replace it with another file.
        </p>
        <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-small text-text-primary hover:bg-surface-hover" onClick={() => upload.current?.click()}>
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
  return (
    <div data-testid="edit-file">
      {over && <p role="status" className="mb-2 text-small text-text-secondary">This file is over 1 MB, so it opens read-only. Replace it by deleting it and uploading another.</p>}
      {file.path === SKILL_FILE_NAME && <p className="mb-2 text-small text-text-secondary" data-testid="version-on-publish">The version in the header is set when you publish, to the version publishing makes.</p>}
      <CodeEditor
        value={text} fileName={file.path} label={`Editing ${file.path}`}
        readOnly={over} onChange={over ? undefined : next => onChange({ path: file.path, bytes: bytesOfText(next) })}
      />
    </div>
  )
}
