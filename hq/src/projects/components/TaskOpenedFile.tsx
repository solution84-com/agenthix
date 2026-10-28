import { useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useQuery, getTaskAttachments } from 'wasp/client/operations'
import type { LocationRef, SiteFileRef } from '@agenthix/core'
import { FileFrame, withMarkdown, type FileFrameProps } from '@agenthix/ui/files'
import { FILES_BUTTON, FilesViewHeader } from '@agenthix/ui/projects'
import { renderMarkdownIn } from '../../shared/components/MarkdownMessage'
import { copyText } from '../../shared/copyText'
import { useOpenAnswer, useOpenFile } from '../../files/useOpenFile'
import { FullScreenFile, OpenFailed } from '../../storage/pages/openedFileParts'
import { openAttachmentThroughHq } from '../hooks/useTaskFiles'
import { taskFileParams, type OpenTaskFile } from '../pages/useTasksToolUrl'

export const FILE_GONE = "This file isn't here any more"

const folderOf = (path: string) => path.split('/').slice(0, -1).join('/')

/**
 * A task file's stable link (spec part 3, *Stable links*): the project's address with the task and the file, never a
 * site, a relay or a ticket. The project is the task key's prefix.
 */
export function taskFileLink(taskKey: string, file: OpenTaskFile, origin = window.location.origin): string {
  const projectKey = taskKey.replace(/-\d+$/, '')
  const params = new URLSearchParams({ task: taskKey })
  const { file: path, attachment } = taskFileParams(file)
  if (path) params.set('file', path)
  if (attachment) params.set('attachment', attachment)
  return `${origin}/projects/${encodeURIComponent(projectKey)}?${params.toString()}`
}

interface Attachment { id: string; fileName: string; createdAt?: string | Date }

/**
 * A task's file open beside the task (spec part 3, *A task's files*; board T1), in ui's frame with the renderer for
 * its kind: beside the task on a wide screen with ✕ to close it, covering the task on a narrow one with ‹ back.
 */
export function TaskOpenedFile({ file, taskId, taskKey, loc, layout, onClose, onOpenWorking }: {
  file: OpenTaskFile
  taskId: string
  taskKey: string
  /** The task's own folder; null where it has none (a task of Your space). */
  loc: LocationRef | null
  layout: 'narrow' | 'wide'
  onClose: () => void
  /** Opens another of the task's working files, from a link or an image in a Markdown file. */
  onOpenWorking: (path: string) => void
}) {
  const { data } = useQuery(getTaskAttachments, { taskId })
  const attachment = file.kind === 'attachment' ? ((data ?? []) as Attachment[]).find(a => a.id === file.id) : undefined
  const workingRef: SiteFileRef | null = file.kind === 'working' && loc ? { space: 'place', loc, path: file.path } : null
  const working = useOpenFile(workingRef)
  const attachmentId = file.kind === 'attachment' ? file.id : null
  const attached = useOpenAnswer(`attachment:${attachmentId ?? ''}`, attachmentId ? () => openAttachmentThroughHq(attachmentId) : null)
  const { answer, error, reopen } = file.kind === 'working' ? working : attached
  const [notice, setNotice] = useState('')
  const [full, setFull] = useState(false)

  const openWorking = useRef(onOpenWorking)
  openWorking.current = onOpenWorking
  const folder = file.kind === 'working' ? folderOf(file.path) : ''
  const locKey = JSON.stringify(loc)
  const registry = useMemo(() => {
    const place = JSON.parse(locKey) as LocationRef | null
    // An attachment's Markdown has no folder of its own to resolve images in.
    if (file.kind === 'attachment' || !place) return withMarkdown(renderMarkdownIn())
    return withMarkdown(renderMarkdownIn({
      place: { space: 'place', loc: place }, folder,
      onOpen: ref => { if (ref.space === 'place') openWorking.current(ref.path) },
    }))
  }, [locKey, folder, file.kind])

  const name = file.kind === 'working' ? file.path.split('/').pop() ?? file.path : attachment?.fileName ?? 'Attachment'
  const breadcrumb = file.kind === 'working'
    ? [taskKey, 'Working files', ...folder.split('/').filter(Boolean)]
    : [taskKey, 'Attachments']
  const back = { label: taskKey, onBack: onClose }

  if (error) return <OpenFailed name={name} error={error} layout={layout} backLabel={taskKey} onBack={onClose} onRetry={reopen} />
  if (file.kind === 'working' && answer?.state === 'not-found') {
    return <FileGone name={name} where={breadcrumb} layout={layout} back={back} onClose={onClose} />
  }

  const frame: FileFrameProps = {
    answer, name, breadcrumb, registry, notice,
    changed: attachment?.createdAt ? `Attached ${new Date(attachment.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}` : undefined,
    onCopyLink: async () => {
      const link = taskFileLink(taskKey, file)
      setNotice((await copyText(link)) ? 'Link copied.' : link)
    },
    onReopen: reopen,
  }
  if (full) return <FullScreenFile frame={frame} onClose={() => setFull(false)} />
  return (
    <Closable layout={layout} onClose={onClose}>
      <FileFrame {...frame} layout={layout} back={back} onFullScreen={() => setFull(true)} />
    </Closable>
  )
}

/** ✕ in the frame's header row on a wide screen; ui's frame has no close of its own. */
function Closable({ layout, onClose, children }: { layout: 'narrow' | 'wide'; onClose: () => void; children: React.ReactNode }) {
  // One element at every width, so the renderer isn't drawn afresh when the width is first known.
  return (
    <div className={`flex h-full min-h-0 flex-1 flex-col${layout === 'wide' ? ' relative [&>div>div:first-child]:pr-11' : ''}`}>
      {children}
      {layout === 'wide' && (
        <button type="button" aria-label="Close" onClick={onClose} className={`${FILES_BUTTON} absolute right-3 top-2.5`}>
          <X size={13} aria-hidden />
        </button>
      )}
    </div>
  )
}

/** A working file that isn't in the task's folder any more: said with where it was, never as a refusal. */
function FileGone({ name, where, layout, back, onClose }: {
  name: string
  where: readonly string[]
  layout: 'narrow' | 'wide'
  back: { label: string; onBack: () => void }
  onClose: () => void
}) {
  return (
    <Closable layout={layout} onClose={onClose}>
      {layout === 'narrow' ? (
        <FilesViewHeader back={back.label} onBack={back.onBack} title={name} />
      ) : (
        <div className="border-b border-border-subtle py-2 pl-4 pr-11">
          <h3 className="truncate text-h3 font-semibold text-text-primary">{name}</h3>
        </div>
      )}
      <div role="status" className="space-y-1 px-4 py-6 text-body text-text-secondary">
        <p>{FILE_GONE}.</p>
        <p className="text-small text-text-muted">It was in {where.join(' › ')}.</p>
      </div>
    </Closable>
  )
}
