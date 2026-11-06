import type { ClipboardEvent, DragEvent } from 'react'
import { MarkdownBox } from '@agenthix/ui/tasks'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'

const imagesOf = (files: FileList | null | undefined): File[] => Array.from(files ?? []).filter(f => f.type.startsWith('image/'))

/**
 * A new task's description: Markdown, written in the box a comment is written in (its toolbar, Write and Preview).
 * Images pasted or dropped on it are not written into the text: the task does not exist yet, so they are kept to be
 * attached to it.
 */
export function NewTaskDescription({ value, onChange, onImages }: {
  value: string
  onChange: (value: string) => void
  onImages: (files: File[]) => void
}) {
  const onPaste = (e: ClipboardEvent) => {
    const images = imagesOf(e.clipboardData?.files)
    if (images.length > 0) { e.preventDefault(); onImages(images) }
  }
  const onDrop = (e: DragEvent) => {
    const images = imagesOf(e.dataTransfer?.files)
    if (images.length > 0) { e.preventDefault(); onImages(images) }
  }
  return (
    <MarkdownBox
      fill value={value} onChange={onChange} label="Description" onPaste={onPaste} onDrop={onDrop}
      placeholder="Describe the task. Markdown works; paste or drop an image to attach it."
      renderPreview={text => <MarkdownMessage content={text} />}
    />
  )
}
