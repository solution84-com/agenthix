import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'

/** Every colour is a design token, so the editor follows light and dark with the rest of the page. */
const theme = EditorView.theme({
  '&': {
    color: 'var(--color-text-primary)',
    backgroundColor: 'var(--color-surface-1)',
    fontSize: 'var(--text-small, 0.8125rem)',
    border: '1px solid var(--color-border)',
    borderRadius: '0.5rem',
  },
  '&.cm-focused': { outline: '2px solid var(--color-accent)', outlineOffset: '-1px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--color-text-primary)' },
  '.cm-cursor': { borderLeftColor: 'var(--color-text-primary)' },
  '.cm-gutters': {
    backgroundColor: 'var(--color-surface-2)',
    color: 'var(--color-text-muted)',
    border: 'none',
    borderRight: '1px solid var(--color-border-subtle)',
  },
  '.cm-activeLine': { backgroundColor: 'var(--color-accent-subtle)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--color-accent-subtle)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--color-accent-subtle)',
  },
})

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--color-syntax-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--color-syntax-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--color-syntax-number)' },
  { tag: [t.comment, t.meta], color: 'var(--color-syntax-comment)', fontStyle: 'italic' },
  { tag: [t.heading, t.function(t.variableName), t.definition(t.variableName)], color: 'var(--color-syntax-title)' },
  { tag: [t.typeName, t.className, t.tagName], color: 'var(--color-syntax-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--color-syntax-attr)' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.link, textDecoration: 'underline' },
])

export const editorTheme: Extension = [theme, syntaxHighlighting(highlight)]
