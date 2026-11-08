import { InlineEdit as UIInlineEdit, MarkdownBox, type InlineEditProps } from '@agenthix/ui/primitives'
import { MarkdownMessage, type MarkdownEmbedContext } from '../MarkdownMessage'

type SiteInlineEditProps = Omit<InlineEditProps, 'renderText' | 'renderEditor'> & {
  /** The text alone, not editable: for someone who may not change it, such as a project Viewer. */
  readOnly?: boolean
  /** The place the text's images and file links resolve in. */
  embed?: MarkdownEmbedContext
}

export function InlineEdit({ readOnly = false, embed, ...props }: SiteInlineEditProps) {
  if (readOnly) {
    return props.value
      ? <MarkdownMessage content={props.value} className={props.textClassName} embed={embed} />
      : null
  }
  return (
    <UIInlineEdit
      {...props}
      renderText={(value, className) => (
        <MarkdownMessage content={value} className={className} embed={embed} />
      )}
      renderEditor={({ value, onChange, placeholder }) => (
        <MarkdownBox
          value={value} onChange={onChange} placeholder={placeholder} label="Text" autoFocus
          renderPreview={text => <MarkdownMessage content={text} embed={embed} />}
        />
      )}
    />
  )
}
