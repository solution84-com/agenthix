import { useRef, useState } from 'react'
import { Loader2, Paperclip } from 'lucide-react'
import { useQuery, useAction, getTaskAttachments, uploadTaskAttachment, getFilesPlace } from 'wasp/client/operations'
import { chooseFileKind, needsFilesAddress } from '@agenthix/core'
import { EmptyState } from '@agenthix/ui/primitives'
import { FILES_BUTTON, FileRow, changedLabel, kindAndSize } from '@agenthix/ui/projects'
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_TOO_LARGE } from '../../shared/attachmentFileName'
import { ShowAttention } from '@agenthix/ui/attention'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * The one line a task's files carry when HQ has no files address and one of them is a kind that needs one to preview
 * (a PDF). Every other attachment opens in the file viewer through HQ's relay on its own address.
 */
export const PDFS_DOWNLOAD_ONLY = "PDFs download rather than open here: this HQ has no files address to preview them."

const needsAddress = (fileName: string) => needsFilesAddress(chooseFileKind(fileName, false).kind)

interface Attachment { id: string; uuid: string; fileName: string; label: string | null; fileSizeBytes: number | null; createdAt?: string | Date }

/**
 * A task's attachments, as their own section under the description (S14): each a row as the Files tool draws it (its
 * icon, name, kind and size, and when it was attached), opening in the file viewer, where it downloads; Attach file at
 * the foot.
 */
export function TaskAttachments({ taskId, selected, onOpen, disabledReason }: {
  taskId: string
  /** The attachment open in the file viewer. */
  selected?: string
  onOpen: (attachmentId: string) => void
  /** Why the person may not attach a file here (a Viewer): Attach file greyed with this as its tooltip. */
  disabledReason?: string
}) {
  const uploadFn = useAction(uploadTaskAttachment)
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data } = useQuery(getTaskAttachments, { taskId })
  const attachments = (data ?? []) as Attachment[]
  const { data: place } = useQuery(getFilesPlace)
  const now = new Date()

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setError(`${file.name} is ${formatBytes(file.size)}. ${ATTACHMENT_TOO_LARGE}`)
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    setUploading(true)
    setError(null)
    try {
      await new Promise<void>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => { uploadFn({ taskId, filename: file.name, dataUrl: reader.result as string }).then(() => resolve(), reject) }
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const attach = (
    <button type="button" onClick={() => fileInput.current?.click()} disabled={uploading || !!disabledReason} title={disabledReason} className={FILES_BUTTON}>
      {uploading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Paperclip size={14} aria-hidden />}
      {uploading ? 'Uploading…' : 'Attach file'}
    </button>
  )

  return (
    <section aria-label="Attachments" className="space-y-2" data-testid="task-attachments">
      <h3 className="flex items-center gap-2 text-small font-medium text-text-primary">
        Attachments
        {attachments.length > 0 && <span className="rounded-full bg-chip px-1.5 text-micro font-medium text-text-secondary">{attachments.length}</span>}
      </h3>
      {attachments.length === 0 && !uploading ? (
        <EmptyState variant="inline" title="No files attached yet." action={attach} />
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border [&>button:last-child]:border-b-0">
            {attachments.map(att => (
              <FileRow
                key={att.id} name={att.fileName}
                meta={kindAndSize({ name: att.fileName, size: att.fileSizeBytes ?? undefined })}
                when={att.createdAt ? changedLabel(new Date(att.createdAt).toISOString(), now) : ''}
                selected={att.id === selected} onOpen={() => onOpen(att.id)}
              />
            ))}
          </div>
          <div>{attach}</div>
        </>
      )}
      {place?.downloadsOnly && attachments.some(att => needsAddress(att.fileName)) && (
        <p className="text-micro text-text-muted">{PDFS_DOWNLOAD_ONLY}</p>
      )}
      <input ref={fileInput} type="file" className="hidden" onChange={onFile} />
      <ShowAttention text={error} title="The file was not attached" onClose={() => setError(null)} />
    </section>
  )
}
