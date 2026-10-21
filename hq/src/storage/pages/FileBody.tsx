import { Loader2 } from 'lucide-react'
import type { FileContent } from '../fileContentService'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'

/** What a file reads as: Markdown and images rendered, code as plain text, and a plain line for the rest. */
export function FileBody({ content, isLoading, error }: { content: FileContent | undefined; isLoading: boolean; error: Error | null }) {
  if (isLoading) {
    return <p className="flex items-center gap-2 px-4 py-4 text-small text-text-muted"><Loader2 size={13} className="animate-spin" aria-hidden /> Loading…</p>
  }
  if (error) return <p role="alert" className="px-4 py-4 text-small text-danger">{error.message}</p>
  if (!content) return null
  switch (content.kind) {
    case 'markdown':
      return <div className="px-4 py-4"><MarkdownMessage content={content.text} /></div>
    case 'code':
      return (
        <pre className="m-4 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-small text-text-primary">
          <code>{content.text}</code>
        </pre>
      )
    case 'image':
      return <div className="px-4 py-4"><img src={content.dataUrl} alt={content.name} className="max-w-full rounded-lg border border-border-subtle" /></div>
    case 'too-large':
      return <p className="px-4 py-4 text-small text-text-muted">This file is too large to preview here.</p>
    case 'binary':
      return <p className="px-4 py-4 text-small text-text-muted">This file type can't be previewed.</p>
  }
}
