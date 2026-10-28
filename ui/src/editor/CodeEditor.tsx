import { useEffect, useRef } from 'react'
import { EditorState, Compartment } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { editorTheme } from './editorTheme'
import { languageFor } from './editorLanguage'

/** Text over this many bytes opens read-only (spec part 6, limits): the editor would stall the page. */
export const EDITOR_LIMIT = 1024 * 1024

export const isOverEditorLimit = (text: string): boolean => new TextEncoder().encode(text).length > EDITOR_LIMIT

export interface CodeEditorProps {
  /** The file's text. A change from outside replaces the document; the person's own typing does not echo back. */
  value: string
  /** The file's name: its extension picks the language. */
  fileName: string
  /** Called with the whole text after each edit. Absent means read-only. */
  onChange?: (text: string) => void
  readOnly?: boolean
  /** Names the editing area for assistive technology. */
  label?: string
}

/** CodeMirror 6 for one text file (Markdown, YAML, JSON, scripts), styled with the design tokens. */
export function CodeEditor({ value, fileName, onChange, readOnly = false, label }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  const locked = readOnly || !onChange || isOverEditorLimit(value)
  const overLimit = isOverEditorLimit(value)
  const mode = useRef(new Compartment())
  const language = useRef(new Compartment())

  useEffect(() => {
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        editorTheme,
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': label ?? fileName }),
        mode.current.of([EditorState.readOnly.of(locked), EditorView.editable.of(!locked)]),
        language.current.of(languageFor(fileName) ?? []),
        EditorView.updateListener.of(update => {
          if (update.docChanged) changeRef.current?.(update.state.doc.toString())
        }),
      ],
    })
    const created = new EditorView({ state, parent: host.current! })
    view.current = created
    return () => { created.destroy(); view.current = null }
    // The editor is made once; the effects below carry later changes into it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
  }, [value])

  useEffect(() => {
    view.current?.dispatch({
      effects: [
        mode.current.reconfigure([EditorState.readOnly.of(locked), EditorView.editable.of(!locked)]),
        language.current.reconfigure(languageFor(fileName) ?? []),
      ],
    })
  }, [locked, fileName])

  return (
    <div>
      {overLimit && (
        <p className="mb-2 text-small text-text-secondary" role="status">
          This file is over 1 MB, so it opens read-only. Replace it by upload instead.
        </p>
      )}
      <div ref={host} />
    </div>
  )
}
