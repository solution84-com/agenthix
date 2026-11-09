import type { Renderer, RendererProps } from '../../renderer'
import { TEXT_LIMIT, useTextFile } from '../text/useTextFile'
import { CodeSurface } from './CodeSurface'

export { HIGHLIGHT_LIMIT } from './CodeSurface'

/** Source code: highlighted, with line numbers, and Wrap off unless the view is narrow. */
export function CodeView(props: RendererProps) {
  const text = useTextFile(props)
  if (text === null) return null
  return <CodeSurface text={text} language={props.facts.language} />
}

export const codeRenderer: Renderer = {
  id: 'code',
  kinds: ['code'],
  runs: 'page',
  previewLimit: TEXT_LIMIT,
  embeds: false,
  render: props => <CodeView {...props} />,
}
