import { RangeSetBuilder, StateField, type Extension, type Text } from '@codemirror/state'
import { Decoration, EditorView, GutterMarker, WidgetType, gutter, type DecorationSet } from '@codemirror/view'

export type LineMark = { line: number; kind: 'added' | 'changed' }
export type LineProblem = { line: number; text: string }

class ChangeMark extends GutterMarker {
  constructor(readonly kind: LineMark['kind']) { super() }
  eq(other: ChangeMark) { return other.kind === this.kind }
  toDOM() {
    const bar = document.createElement('span')
    bar.className = `cm-change-mark cm-change-${this.kind}`
    bar.title = this.kind === 'added' ? 'Added' : 'Changed'
    return bar
  }
}

class ProblemLine extends WidgetType {
  constructor(readonly text: string) { super() }
  eq(other: ProblemLine) { return other.text === this.text }
  toDOM() {
    const box = document.createElement('div')
    box.className = 'cm-problem'
    box.setAttribute('role', 'note')
    box.textContent = `✕ ${this.text}`
    return box
  }
}

/** The lines that are in the text, in order, the first of any repeated, so a range set can be built from them. */
function inOrder<T extends { line: number }>(items: readonly T[], doc: Text): T[] {
  const seen = new Set<number>()
  return [...items]
    .filter(i => i.line >= 1 && i.line <= doc.lines)
    .sort((a, b) => a.line - b.line)
    .filter(i => (seen.has(i.line) ? false : (seen.add(i.line), true)))
}

const look = EditorView.theme({
  '.cm-change-gutter .cm-gutterElement': { width: '4px', padding: '0 0 0 1px' },
  '.cm-change-mark': { display: 'block', width: '3px', height: '100%' },
  '.cm-change-added': { backgroundColor: 'var(--color-success)' },
  '.cm-change-changed': { backgroundColor: 'var(--color-warning)' },
  '.cm-problem-line': { backgroundColor: 'var(--color-surface-2)' },
  '.cm-problem': {
    color: 'var(--color-danger)', fontFamily: 'var(--font-sans)', padding: '2px 8px', margin: '2px 0',
    borderLeft: '2px solid var(--color-danger)', backgroundColor: 'var(--color-surface-2)',
  },
})

function problemsOn(doc: Text, problems: readonly LineProblem[]): DecorationSet {
  const set = new RangeSetBuilder<Decoration>()
  for (const p of inOrder(problems, doc)) {
    const line = doc.line(p.line)
    set.add(line.from, line.from, Decoration.line({ class: 'cm-problem-line' }))
    set.add(line.to, line.to, Decoration.widget({ widget: new ProblemLine(p.text), block: true, side: 1 }))
  }
  return set.finish()
}

/**
 * The editor's marks beside and under its lines: a bar in the margin for each line added or changed, and a problem
 * written under its line. Read against the text as it is, so a mark never points past its end. A problem is a block
 * under its line, so it is held in a state field: the editor's layout may only be changed by decorations given directly.
 */
export function lineDecorations(marks: readonly LineMark[], problems: readonly LineProblem[]): Extension {
  const field = StateField.define<DecorationSet>({
    create: state => problemsOn(state.doc, problems),
    update: (set, tr) => (tr.docChanged ? problemsOn(tr.state.doc, problems) : set),
    provide: f => EditorView.decorations.from(f),
  })
  return [
    look,
    field,
    gutter({
      class: 'cm-change-gutter',
      markers: view => {
        const doc = view.state.doc
        const set = new RangeSetBuilder<GutterMarker>()
        for (const m of inOrder(marks, doc)) set.add(doc.line(m.line).from, doc.line(m.line).from, new ChangeMark(m.kind))
        return set.finish()
      },
    }),
  ]
}
