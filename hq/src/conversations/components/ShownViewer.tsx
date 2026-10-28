import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { SiteFileRef } from '@agenthix/core'
import type { ShownPart } from '../../shared/conversations/shownParts'
import { MarkdownMessage } from '../../shared/components/MarkdownMessage'
import { OpenedFile } from '../../storage/pages/OpenedFile'
import { linkParamsOf, referenceLabel, referenceOf } from '../../storage/pages/fileReferences'
import { useConversationEmbed } from './conversationFiles'
import { TaskOpenedFile } from '../../projects/components/TaskOpenedFile'
import type { OpenedTaskFile } from '../../shared/components/markdownEmbed/taskChipTypes'

const ASIDE = 'fixed inset-x-0 bottom-0 z-40 flex max-h-[70vh] flex-col rounded-t-2xl border border-border bg-surface-1 shadow-pop lg:static lg:z-auto lg:max-h-none lg:w-[420px] lg:shrink-0 lg:rounded-none lg:border-y-0 lg:border-r-0 lg:shadow-none'

/** The place beside the thread: 420 px on a wide screen, a sheet from the bottom on a phone. */
export function Beside({ label, testId, children }: { label: string; testId: string; children: ReactNode }) {
  return (
    <aside data-testid={testId} aria-label={label} className={ASIDE}>
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border lg:hidden" aria-hidden />
      {children}
    </aside>
  )
}

/**
 * A shown part opened from its card: beside the thread on a wide screen, a sheet from the bottom on a phone. It
 * takes no focus and no sound from voice, which keeps going; the pill, mute and End stay in reach.
 */
export function ShownViewer({ part, onClose }: { part: ShownPart; onClose: () => void }) {
  const embed = useConversationEmbed()
  return (
    <Beside label={part.title} testId="shown-viewer">
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <h2 className="min-w-0 flex-1 truncate text-body font-medium text-text-primary">{part.title}</h2>
        <button type="button" aria-label="Close" onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary max-lg:size-10">
          <X size={16} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-reading">
        <MarkdownMessage content={part.body} embed={embed} />
      </div>
    </Beside>
  )
}

/**
 * A file a chip opened, in the same place beside the thread as a shown part, in ui's frame (spec part 3, *Chips in
 * conversations*). Copy link gives the place's stable link; a link in it opens the next file here.
 */
export function FileViewer({ file, placePath, onOpen, onOpenFolder, onClose }: {
  file: SiteFileRef
  placePath: string
  onOpen: (ref: SiteFileRef) => void
  /** Opens the folder a file that's gone was in, in the place's Files tool. */
  onOpenFolder?: (ref: SiteFileRef) => void
  onClose: () => void
}) {
  const reference = referenceOf(file) ?? ''
  const path = file.space === 'artefact' ? file.name : file.path
  const name = path.split('/').pop() ?? path
  const folders = referenceLabel(reference).split('/').slice(0, -1)
  const top = file.space === 'artefact' ? 'Artefacts' : file.space === 'place' && file.loc.workspaceId ? 'Workspace' : 'Files'
  return (
    <Beside label={name} testId="file-viewer">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <OpenedFile
          key={reference}
          file={file} kind={file.space === 'artefact' ? 'artefacts' : 'files'} path={path}
          breadcrumb={[top, ...folders]} backLabel="Close" onBack={onClose} layout="narrow"
          link={linkParamsOf(file) ?? {}} linkBase={placePath} onOpenFile={onOpen}
          onOpenFolder={onOpenFolder ? () => onOpenFolder(file) : undefined}
        />
      </div>
    </Beside>
  )
}

/**
 * A task's file a task chip opened, in the same place beside the thread, through the task's own opening
 * (`openFile` for a working file, `openTaskAttachment` for an attachment); Copy link gives the task's link form.
 */
export function TaskFileViewer({ opened, onOpen, onClose }: {
  opened: OpenedTaskFile
  onOpen: (opened: OpenedTaskFile) => void
  onClose: () => void
}) {
  const name = opened.file.kind === 'working' ? opened.file.path.split('/').pop() ?? opened.file.path : opened.taskKey
  return (
    <Beside label={name} testId="task-file-viewer">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TaskOpenedFile
          key={JSON.stringify(opened.file)}
          file={opened.file} taskId={opened.taskId} taskKey={opened.taskKey} loc={opened.loc} layout="narrow"
          onClose={onClose} onOpenWorking={path => onOpen({ ...opened, file: { kind: 'working', path } })}
        />
      </div>
    </Beside>
  )
}
