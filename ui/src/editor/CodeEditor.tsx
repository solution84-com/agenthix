import { useEffect, useMemo, useRef } from 'react'
import { EditorState, Compartment, Transaction } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { lineDecorations, type LineMark, type LineProblem } from './lineDecorations'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { editorTheme } from './editorTheme'
import { languageFor } from './editorLanguage'
import { Tooltip } from '../primitives/Tooltip'

/** Text over this many bytes opens read-only (spec part 6, limits): the editor would stall the page. */
export const EDITOR_LIMIT = 1024 * 1024

export const isOverEditorLimit = (text: string): boolean => {
  // A character is at least one and at most three bytes here, so only the middle band needs the exact count.
  if (text.length > EDITOR_LIMIT) return true
  if (text.length * 3 <= EDITOR_LIMIT) return false
  return new TextEncoder().encode(text).length > EDITOR_LIMIT
}

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
  /** The number the first line shows, when the text is the part of a file that starts further down. */
  firstLine?: number
  /** Lines marked in the margin as added or changed, the text's first line numbered 1. */
  marks?: readonly LineMark[]
  /** Problems, each written under its line, numbered as `marks` are. */
  problems?: readonly LineProblem[]
}

const NONE: readonly never[] = []
const numbered = (first: number) => lineNumbers({ formatNumber: n => String(n + first - 1) })

/** CodeMirror 6 for one text file (Markdown, YAML, JSON, scripts), styled with the design tokens. */
export function CodeEditor({ value, fileName, onChange, readOnly = false, label, firstLine = 1, marks = NONE, problems = NONE }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  const overLimit = useMemo(() => isOverEditorLimit(value), [value])
  // Over the limit only the first part is given to the editor, which would stall on the whole text.
  const shown = overLimit ? value.slice(0, EDITOR_LIMIT) : value
  const locked = readOnly || !onChange || overLimit
  const mode = useRef(new Compartment())
  const language = useRef(new Compartment())
  const numbers = useRef(new Compartment())
  const lines = useRef(new Compartment())

  useEffect(() => {
    const state = EditorState.create({
      doc: shown,
      extensions: [
        numbers.current.of(numbered(firstLine)),
        lines.current.of(lineDecorations(marks, problems)),
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
    // Not part of the undo history: undoing must never bring back the text of a file shown before.
    if (v && v.state.doc.toString() !== shown) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: shown }, annotations: Transaction.addToHistory.of(false) })
    }
  }, [shown])

  useEffect(() => {
    view.current?.dispatch({
      effects: [
        mode.current.reconfigure([EditorState.readOnly.of(locked), EditorView.editable.of(!locked)]),
        language.current.reconfigure(languageFor(fileName) ?? []),
      ],
    })
  }, [locked, fileName])

  useEffect(() => {
    view.current?.dispatch({ effects: [numbers.current.reconfigure(numbered(firstLine)), lines.current.reconfigure(lineDecorations(marks, problems))] })
  }, [firstLine, marks, problems])

  return (
    <div>
      <Tooltip label="This file is over 1 MB, so it opens read-only and shows only its first 1 MB. Replace it by upload instead." wrap side="top" disabled={!overLimit}>
        <div ref={host} aria-disabled={overLimit ? true : undefined} className={overLimit ? 'opacity-40' : undefined} />
      </Tooltip>
    </div>
  )
}
