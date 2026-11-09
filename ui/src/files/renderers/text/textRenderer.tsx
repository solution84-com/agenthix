import type { Renderer, RendererProps } from '../../renderer'
import { TextLines } from './TextLines'
import { TEXT_LIMIT, useTextFile } from './useTextFile'

/** Plain text, wrapped so a long line never scrolls the page sideways. Drawn as text and never as HTML. */
export function TextView(props: RendererProps) {
  const text = useTextFile(props)
  if (text === null) return null
  return <TextLines text={text} />
}

export const textRenderer: Renderer = {
  id: 'text',
  kinds: ['text'],
  runs: 'page',
  previewLimit: TEXT_LIMIT,
  embeds: false,
  render: props => <TextView {...props} />,
}
