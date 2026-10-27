import type { Renderer, RendererProps } from '../../renderer'
import { TEXT_LIMIT, useTextFile } from './useTextFile'

/** Plain text, wrapped so a long line never scrolls the page sideways. Drawn as text and never as HTML. */
export function TextView(props: RendererProps) {
  const text = useTextFile(props)
  if (text === null) return null
  return <pre className="whitespace-pre-wrap break-words font-mono text-small text-text-primary">{text}</pre>
}

export const textRenderer: Renderer = {
  id: 'text',
  kinds: ['text'],
  runs: 'page',
  previewLimit: TEXT_LIMIT,
  embeds: false,
  render: props => <TextView {...props} />,
}
