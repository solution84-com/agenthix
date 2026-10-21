import { InlineEdit as UIInlineEdit, type InlineEditProps } from '@agenthix/ui/primitives'
import { MarkdownMessage } from '../MarkdownMessage'
import { RichTextEditor } from './RichTextEditor'

type SiteInlineEditProps = Omit<InlineEditProps, 'renderText' | 'renderEditor'> & {
  /** The text alone, not editable: for someone who may not change it, such as a project Viewer. */
  readOnly?: boolean
}

export function InlineEdit({ readOnly = false, ...props }: SiteInlineEditProps) {
  if (readOnly) {
    return props.value
      ? <MarkdownMessage content={props.value} className={props.textClassName} />
      : null
  }
  return (
    <UIInlineEdit
      {...props}
      renderText={(value, className) => (
        <MarkdownMessage content={value} className={className} />
      )}
      renderEditor={({ value, onChange, placeholder }) => (
        <RichTextEditor value={value} onChange={onChange} placeholder={placeholder} />
      )}
    />
  )
}
