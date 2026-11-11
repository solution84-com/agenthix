/**
 * A task's own attachment embedded in its text (spec part 2, *Embedded files*): `attachments/<task key>/<file>`. An
 * attachment is an upload hq keeps itself, not a file of a place, so it is opened through `openTaskAttachment`, which
 * checks the person may open it, rather than through the batch. It is found by its name among the task's attachments
 * (`getTaskAttachments`, which checks the person may see the task); the newest of that name wins. Inside a sentence it
 * is the chip a conversation shows (`TaskChip`).
 */
import { createContext, useContext } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import type { FileOpenAnswer } from '@agenthix/core'
import { FileFrame } from '@agenthix/ui/files'
import { CARDS_ONLY, ImageEmbed, type Size } from './EmbedParts'
import { useOpenAnswer } from './useEmbedAnswer'

/** An open answer, with the attachment's id once it is found, so a click can open it beside the task. */
export type AttachmentAnswer = FileOpenAnswer & { attachmentId?: string }
export type OpenAttachment = (taskId: string, fileName: string) => Promise<AttachmentAnswer>

type AttachmentRow = { id: string; fileName: string }

const openThroughHq: OpenAttachment = async (taskId, fileName) => {
  // Loaded when the first attachment is embedded, so Markdown with none never loads the operations client.
  const { getTaskAttachments, openTaskAttachment } = await import('wasp/client/operations')
  try {
    const rows = (await getTaskAttachments({ taskId })) as AttachmentRow[]
    const row = rows.filter(r => r.fileName === fileName).pop()
    if (!row) return { state: 'not-found' }
    return { ...((await openTaskAttachment({ attachmentId: row.id })) as FileOpenAnswer), attachmentId: row.id }
  } catch {
    return { state: 'site-unavailable' }
  }
}

/** How attachments are opened; tests give their own. */
export const OpenAttachmentContext = createContext<OpenAttachment | null>(null)

function useAttachmentAnswer(taskId: string, fileName: string, renew = false) {
  const open = useContext(OpenAttachmentContext) ?? openThroughHq
  return useOpenAnswer(JSON.stringify(['attachment', taskId, fileName]), () => open(taskId, fileName), renew)
}

const LINK = `rounded text-link hover:underline underline underline-offset-2 ${FOCUS_RING}`

type Props = { taskId: string; fileName: string; onOpen?: (attachmentId: string) => void }

function opener(answer: FileOpenAnswer | undefined, onOpen: Props["onOpen"]) {
  const id = (answer as AttachmentAnswer | undefined)?.attachmentId
  return id && onOpen ? () => onOpen(id) : undefined
}

export function AttachmentImage({ taskId, fileName, alt, onOpen, ...size }: Props & { alt?: string } & Size) {
  const opened = useAttachmentAnswer(taskId, fileName)
  return (
    <ImageEmbed
      opened={opened} name={fileName} alt={alt} size={size} onOpen={opener(opened.answer, onOpen)}
      notImage={(answer, label) => <a href={answer.downloadLink} download={fileName} className={LINK}>{label}</a>}
    />
  )
}

export function AttachmentCard({ taskId, fileName, onOpen }: Props) {
  const { answer, observe, retry } = useAttachmentAnswer(taskId, fileName, true)
  return (
    <div ref={observe} data-embed="card" className="my-2">
      <FileFrame answer={answer} name={fileName} mode="embedded" registry={CARDS_ONLY} onReopen={retry} onOpen={opener(answer, onOpen)} />
    </div>
  )
}
