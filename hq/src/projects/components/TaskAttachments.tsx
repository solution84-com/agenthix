import { useRef, useState } from 'react'
import { Paperclip, Download, Loader2 } from 'lucide-react'
import { useQuery, useAction, getTaskAttachments, uploadTaskAttachment, getFilesPlace } from 'wasp/client/operations'
import { fileLink } from '../../shared/utils/agentImageUrl'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** The one line a task's files carry when HQ can show uploads only as downloads: no thumbnail, no preview, and why. */
export const FILES_OPEN_ON_YOUR_COMPUTER = 'Files open on your computer, not here — this HQ shows uploads as downloads only.'

interface Attachment { id: string; uuid: string; fileName: string; label: string | null; fileSizeBytes: number | null }

/** A task's files: the list, Attach file, and a download by a link to the files origin. */
export function TaskAttachments({ taskId }: { taskId: string }) {
  const uploadFn = useAction(uploadTaskAttachment)
  const fileInput = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { data } = useQuery(getTaskAttachments, { taskId })
  const attachments = (data ?? []) as Attachment[]
  const { data: place } = useQuery(getFilesPlace)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
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

  /**
   * Uploaded files are served from their own origin, to a short-lived link HQ
   * makes for this person (adr-0114). Asked for as a download, so the files
   * origin sends it as one and the browser saves it rather than leave this page.
   */
  async function download(att: Attachment) {
    setError(null)
    try {
      const { url } = await fileLink(`/files/task/${taskId}/${att.uuid}/${encodeURIComponent(att.fileName)}`, true)
      const link = document.createElement('a')
      link.href = url
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    }
  }

  return (
    <div className="space-y-1.5">
      {attachments.length === 0 && !uploading && <p className="text-small text-text-muted">No files yet.</p>}
      <ul className="space-y-0.5">
        {attachments.map(att => (
          <li key={att.id} className="flex items-center gap-1.5 text-small text-text-secondary">
            <Paperclip size={11} className="shrink-0 text-text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{att.fileName}</span>
            {att.fileSizeBytes != null && <span className="shrink-0 text-micro text-text-muted">{formatBytes(att.fileSizeBytes)}</span>}
            <button type="button" aria-label={`Download ${att.fileName}`} onClick={() => void download(att)} className="text-text-muted hover:text-text-primary">
              <Download size={11} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {place?.downloadsOnly && attachments.length > 0 && <p className="text-micro text-text-muted">{FILES_OPEN_ON_YOUR_COMPUTER}</p>}
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1 text-small text-accent hover:underline disabled:opacity-40"
      >
        {uploading ? <Loader2 size={11} className="animate-spin" aria-hidden /> : <Paperclip size={11} aria-hidden />}
        {uploading ? 'Uploading…' : 'Attach file'}
      </button>
      <input ref={fileInput} type="file" className="hidden" onChange={onFile} />
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </div>
  )
}
