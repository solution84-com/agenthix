import { useState, type ReactNode } from 'react'
import type { Renderer, RendererProps } from '../../renderer'
import { TextView } from '../text/textRenderer'
import { TEXT_LIMIT, useTextFile } from '../text/useTextFile'

/** What the caller draws Markdown with (hq passes its `MarkdownMessage`); ui never imports a Markdown library. */
export type RenderMarkdown = (markdown: string) => ReactNode

const TAB = 'rounded-md px-2.5 py-1 text-small'

function MarkdownView({ renderMarkdown, ...props }: RendererProps & { renderMarkdown: RenderMarkdown }) {
  const text = useTextFile(props)
  const [view, setView] = useState<'read' | 'source'>('read')
  if (text === null) return null
  const embedded = props.mode === 'embedded'
  return (
    <div>
      {!embedded && (
        <div role="tablist" aria-label="View" className="mb-3 flex gap-1">
          {(['read', 'source'] as const).map(v => (
            <button
              key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className={`${TAB} ${view === v ? 'bg-selected text-text-primary' : 'text-text-secondary hover:text-text-primary'}`}
            >
              {v === 'read' ? 'Read' : 'Source'}
            </button>
          ))}
        </div>
      )}
      {embedded || view === 'read'
        ? <div className="text-body text-text-primary">{renderMarkdown(text)}</div>
        : <pre className="whitespace-pre-wrap break-words font-mono text-small text-text-primary">{text}</pre>}
    </div>
  )
}

/** Markdown drawn by the caller's `renderMarkdown`, with Read and Source when opened and Read alone when embedded. */
export function createMarkdownRenderer(renderMarkdown: RenderMarkdown): Renderer {
  return {
    id: 'markdown',
    kinds: ['markdown'],
    runs: 'page',
    previewLimit: TEXT_LIMIT,
    // Only images draw inside a page (spec part 2, *Embedded files*); a Markdown file embedded is a card.
    embeds: false,
    render: props => <MarkdownView {...props} renderMarkdown={renderMarkdown} />,
  }
}

/**
 * The registry's own entry, for a caller that supplies no Markdown drawing: the file's text, as text. A caller that
 * has one puts `createMarkdownRenderer(...)` before the default list (`withMarkdown`).
 */
export const markdownRenderer: Renderer = {
  id: 'markdown',
  kinds: ['markdown'],
  runs: 'page',
  previewLimit: TEXT_LIMIT,
  embeds: false,
  render: props => <TextView {...props} />,
}
