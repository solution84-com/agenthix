import { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent, type Ref } from 'react'
import { markSkill } from './atPicker/skillMark'
import { DraftChip } from '../../shared/components/markdownEmbed/FileChip'
import type { TextField } from '../hooks/useDictation'
import {
  chipsInField, chipsOf, fieldPieces, isFlat, needsEndBreak, patchText, readField, sameChips, selectIn, selectionIn,
  withInserted, withMention, type FieldPiece,
} from './messageFieldText'

export const MAX_FIELD_PX = 128

export type MessageFieldHandle = TextField & {
  /** Mention: the reference goes in at the caret, as a chip. */
  insertMention: (reference: string) => void
  /** The `@` picker: the reference replaces the text from `start` to `end`, as a chip. */
  mentionAt: (start: number, end: number, reference: string) => void
  /** Where the caret is on screen, for the picker to open beside it. */
  caretRect: () => DOMRect | null
  element: () => HTMLDivElement | null
}

type Caret = { start: number; end: number; focus: boolean }

function drawPieces(pieces: FieldPiece[]) {
  const drawn = pieces.map((p, i) => (p.kind === 'text' ? p.text : (
    <span key={i} contentEditable={false} data-reference={p.reference} role="img" aria-label={p.reference.split('/').pop() || p.reference}>
      <DraftChip reference={p.reference} />
    </span>
  )))
  return needsEndBreak(pieces) ? [...drawn, <br key="end" />] : drawn
}

/**
 * The message box's text field (spec part 3, *Chips in conversations*): an editable line that shows each file its text
 * names as a chip — one piece, deleted with one Backspace — while its text, what is sent, keeps the paths. A path
 * typed becomes a chip once something follows it; one pasted or put in by Mention at once. Only plain text goes in.
 *
 * The browser edits the field directly while the person types. When the chips must change, the field is drawn anew
 * (a new element, keyed), since its contents are no longer what React drew.
 */
export function MessageField({ text, onText, onSubmit, onFocus, placeholder, twoLines, handle, onCaret, onKeyFirst, listbox, mark = null }: {
  text: string
  onText: (text: string) => void
  onSubmit: () => void
  onFocus?: () => void
  placeholder: string
  twoLines: boolean
  handle: Ref<MessageFieldHandle>
  /** The text and where the caret is in it after each change and caret move; null while the field has no focus. */
  onCaret?: (text: string, caret: number | null) => void
  /** Sees a key first; true when it took it. */
  onKeyFirst?: (e: KeyboardEvent<HTMLDivElement>) => boolean
  /** A list the field is typing into, such as the `@` picker, and its option the keys are on. */
  listbox?: { id: string; activeId: string | undefined } | null
  /** The skill picked with `/`, as it reads at the start of the text: shown highlighted. */
  mark?: string | null
}) {
  const el = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState({ version: 0, text, hold: null as number | null })
  const held = useRef(text)
  const last = useRef<[number, number]>([text.length, text.length])
  const pending = useRef<Caret | null>(null)
  const redrawing = useRef(false)
  const composing = useRef(false)
  const marked = useRef<HTMLDivElement | null>(null)
  const onTextNow = useRef(onText)
  onTextNow.current = onText
  const onCaretNow = useRef(onCaret)
  onCaretNow.current = onCaret
  const tellCaret = () => {
    const root = el.current
    const sel = root && document.activeElement === root ? selectionIn(root) : null
    onCaretNow.current?.(held.current, sel && sel[0] === sel[1] ? sel[1] : null)
  }

  const focused = () => el.current !== null && document.activeElement === el.current
  const selection = (): [number, number] => {
    const now = focused() && el.current ? selectionIn(el.current) : null
    const n = held.current.length
    return now ?? [Math.min(last.current[0], n), Math.min(last.current[1], n)]
  }
  const place = (at: Caret) => {
    const root = el.current
    last.current = [at.start, at.end]
    if (!root || !at.focus) return
    if (!focused()) root.focus()
    selectIn(root, at.start, at.end)
    tellCaret()
  }
  const redraw = (next: string, hold: number | null, caret: Caret | null) => {
    held.current = next
    pending.current = caret
    redrawing.current = true
    setShown((s) => ({ version: s.version + 1, text: next, hold }))
  }
  /** A change the field makes itself — Mention, a paste, a line break, a chip deleted — goes through the box's text. */
  const change = (next: string, caret: number) => {
    const at = { start: caret, end: caret, focus: true }
    if (next === held.current) { place(at); return }
    pending.current = at
    onTextNow.current(next)
  }
  const replace = (insert: string) => {
    const r = withInserted(held.current, selection(), insert)
    change(r.text, r.caret)
  }

  // The text changed outside the field — dictation, a send that cleared it, or one of the field's own changes.
  useLayoutEffect(() => {
    if (text === held.current) return
    const root = el.current
    const caret = pending.current ?? (focused() ? { start: Math.min(last.current[1], text.length), end: Math.min(last.current[1], text.length), focus: true } : null)
    pending.current = null
    if (root && patchText(root, fieldPieces(text, null))) {
      held.current = text
      if (caret) place(caret)
    } else redraw(text, null, caret)
  }, [text])

  // After every draw, since the browser may have replaced the text nodes the mark is painted over.
  useLayoutEffect(() => {
    const root = el.current
    if (marked.current && marked.current !== root) markSkill(marked.current, null)
    marked.current = root
    if (root) markSkill(root, mark && text.startsWith(mark) ? mark.length : null)
  })
  useEffect(() => () => { if (marked.current) markSkill(marked.current, null) }, [])

  useLayoutEffect(() => {
    redrawing.current = false
    const at = pending.current
    pending.current = null
    if (at) place(at)
  }, [shown.version])

  /** The person typed: their text is taken as it stands, and the field is drawn anew only when its chips must change. */
  const read = (all: boolean) => {
    const root = el.current
    if (!root) return
    const next = readField(root)
    const sel = selectionIn(root)
    if (sel) last.current = sel
    const changed = next !== held.current
    if (!composing.current) {
      const hold = all || !sel ? null : sel[1]
      if (!isFlat(root) || !sameChips(chipsOf(fieldPieces(next, hold)), chipsInField(root))) {
        redraw(next, hold, sel && focused() ? { start: sel[1], end: sel[1], focus: true } : null)
      } else held.current = next
    } else held.current = next
    if (changed) onTextNow.current(next)
    tellCaret()
  }

  useImperativeHandle(handle, () => ({
    get selectionStart() { return selection()[0] },
    get selectionEnd() { return selection()[1] },
    setSelectionRange(start: number, end: number) {
      if (redrawing.current) pending.current = { start, end, focus: true }
      else place({ start, end, focus: true })
    },
    hasFocus: focused,
    insertMention(reference: string) {
      const r = withMention(held.current, selection(), reference)
      change(r.text, r.caret)
    },
    mentionAt(start: number, end: number, reference: string) {
      const r = withMention(held.current, [start, end], reference)
      change(r.text, r.caret)
    },
    caretRect() {
      const sel = window.getSelection()
      if (!el.current || !sel || sel.rangeCount === 0 || !el.current.contains(sel.anchorNode)) return null
      const range = sel.getRangeAt(0)
      return typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect() : null
    },
    element: () => el.current,
  }), [])

  // Where the caret was, so Mention goes in there even after the field lost the focus.
  useEffect(() => {
    const track = () => {
      const root = el.current
      const sel = root && selectionIn(root)
      if (sel) last.current = sel
      if (root && document.activeElement === root) tellCaret()
    }
    document.addEventListener('selectionchange', track)
    return () => document.removeEventListener('selectionchange', track)
  }, [])

  // No formatting, and a line break from a keyboard that sends no Enter key goes in as a new line.
  useEffect(() => {
    const root = el.current
    if (!root) return
    const before = (e: InputEvent) => {
      if (e.inputType.startsWith('format')) e.preventDefault()
      else if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') { e.preventDefault(); replace('\n') }
    }
    root.addEventListener('beforeinput', before)
    return () => root.removeEventListener('beforeinput', before)
  }, [shown.version])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (composing.current || e.nativeEvent.isComposing) return
    if (onKeyFirst?.(e)) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) replace('\n')
      else onSubmit()
      return
    }
    if (e.key !== 'Backspace' && e.key !== 'Delete') return
    const root = el.current
    const sel = root && selectionIn(root)
    if (!root || !sel || sel[0] !== sel[1]) return
    const chips = chipsInField(root)
    const chip = e.key === 'Backspace' ? chips.find((c) => c.end === sel[0]) : chips.find((c) => c.start === sel[0])
    if (!chip) return
    e.preventDefault()
    change(held.current.slice(0, chip.start) + held.current.slice(chip.end), chip.start)
  }
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    replace(e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n'))
  }
  const onCopy = (e: ClipboardEvent<HTMLDivElement>, cut: boolean) => {
    const root = el.current
    const sel = root && selectionIn(root)
    if (!sel || sel[0] === sel[1]) return
    e.preventDefault()
    e.clipboardData.setData('text/plain', held.current.slice(sel[0], sel[1]))
    if (cut) change(held.current.slice(0, sel[0]) + held.current.slice(sel[1]), sel[0])
  }
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const dropped = e.dataTransfer.getData('text/plain')
    if (dropped) replace(dropped)
  }
  // Events from a field just replaced are not this field's.
  const mine = (target: EventTarget) => target === el.current

  const content = useMemo(() => drawPieces(fieldPieces(shown.text, shown.hold)), [shown])
  const pad = twoLines ? 'px-2.5 pb-1 pt-1.5' : 'px-2 py-1.5'

  return (
    <div className={`relative min-w-0 ${twoLines ? 'w-full' : 'flex-1'}`}>
      {text === '' && (
        <span aria-hidden className={`pointer-events-none absolute inset-0 truncate text-body text-text-muted ${pad}`}>{placeholder}</span>
      )}
      <div
        key={shown.version}
        ref={el}
        role="textbox"
        aria-multiline="true"
        aria-label={placeholder}
        aria-placeholder={placeholder}
        aria-autocomplete={listbox ? 'list' : undefined}
        aria-controls={listbox?.id}
        aria-activedescendant={listbox?.activeId}
        data-picked-skill={mark ?? undefined}
        tabIndex={0}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => { if (mine(e.currentTarget)) read(false) }}
        onBlur={(e) => { if (mine(e.currentTarget)) { read(true); onCaretNow.current?.(held.current, null) } }}
        onCompositionStart={() => { composing.current = true }}
        onCompositionEnd={(e) => { composing.current = false; if (mine(e.currentTarget)) read(false) }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onCopy={(e) => onCopy(e, false)}
        onCut={(e) => onCopy(e, true)}
        onDrop={onDrop}
        onFocus={onFocus}
        style={{ maxHeight: MAX_FIELD_PX }}
        className={`min-h-[36px] overflow-y-auto whitespace-pre-wrap break-words text-body text-text-primary focus:outline-none ${pad}`}
      >
        {content}
      </div>
    </div>
  )
}
