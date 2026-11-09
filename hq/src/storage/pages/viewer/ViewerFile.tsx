import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useQuery, getFileFacts, getProjects, getTaskAttachments } from 'wasp/client/operations'
import type { SiteFileRef } from '@agenthix/core'
import { writeTaskReference } from '../../../shared/taskReferences'
import type { FileFactsAnswer } from '../../../files/fileFactsAnswer'
import { openAttachmentThroughHq } from '../../../projects/hooks/useTaskFiles'
import { OpenedFile } from '../OpenedFile'
import type { NotThere } from '../openedFileParts'
import type { ViewerTarget } from './viewerAddress'
import { noFileAt } from './fileWords'
import {
  breadcrumbOf, filesAddressOf, filesTwinOf, folderAddressOf, linkOf, pathOf, whereOf,
} from './viewerFileParts'

type FileTarget = Extract<ViewerTarget, { kind: 'file' }>
type AttachmentTarget = Extract<ViewerTarget, { kind: 'attachment' }>
type Back = { label: string; onBack: () => void }

/** The file a target names, in the one frame every file opens in, with ‹ back to where the person came from. */
export function ViewerFile({ target, back, onOpen }: {
  target: ViewerTarget
  back: Back
  /** Opens another file in the viewer, from a link or an image in this one. */
  onOpen: (target: ViewerTarget) => void
}) {
  if (target.kind === 'attachment') return <ViewerAttachment target={target} back={back} />
  return <ViewerPlaceFile target={target} back={back} onOpen={onOpen} />
}

function ViewerPlaceFile({ target, back, onOpen }: { target: FileTarget; back: Back; onOpen: (target: ViewerTarget) => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { ref } = target
  const path = pathOf(ref)
  const twin = filesTwinOf(target)
  // A task's working file asked for by a path that names nothing may be the place's own file of the same path.
  const { data: twinFacts } = useQuery(getFileFacts, twin ? { files: [twin] } : undefined, { enabled: !!twin })
  const twinThere = (twinFacts?.answers as FileFactsAnswer[] | undefined)?.[0]?.state === 'ready'
  const link = linkOf(target)
  const showInFiles = filesAddressOf(target)
  const folderAddress = folderAddressOf(target)
  const projectName = useProjectName(ref)
  const breadcrumb = breadcrumbOf(target, { project: projectName, page: pathname })

  // Opened where it was mentioned, a missing file may never have been there: say what was asked for, not that it went.
  const notThere: NotThere = {
    words: noFileAt(path, whereOf(target, { project: projectName })),
    action: twin && twinThere
      ? { label: `Open Files › ${path.split('/').join(' › ')}`, onAction: () => onOpen({ ...target, ref: twin }) }
      : folderAddress
        ? { label: `Open ${breadcrumb[breadcrumb.length - 1]}`, onAction: () => navigate(folderAddress) }
        : undefined,
  }
  const openNext = (next: SiteFileRef) => onOpen({ ...target, ref: next })

  return (
    <OpenedFile
      key={JSON.stringify(ref)}
      file={ref} kind={ref.space === 'artefact' ? 'artefacts' : ref.space === 'knowledge' ? 'knowledge' : 'files'}
      path={path} breadcrumb={breadcrumb} back={back}
      link={link?.names ?? {}} linkBase={link?.base} onOpenFile={openNext} notThere={notThere}
      onShowInFiles={showInFiles ? () => navigate(showInFiles) : undefined}
    />
  )
}

/** The name of the project whose own files a file is in, so a file that isn't there says where it was looked for. */
function useProjectName(ref: SiteFileRef): string | undefined {
  const projectId = ref.space === 'place' && ref.loc.ownerType === 'project' && !ref.loc.taskId && !ref.loc.workspaceId
    ? ref.loc.ownerId
    : null
  const { data } = useQuery(getProjects, undefined, { enabled: !!projectId })
  return projectId ? data?.find(p => p.id === projectId)?.name : undefined
}

interface Attachment { id: string; fileName: string }

/** A task's attachment: an upload hq keeps itself, opened through hq's own relay (`openTaskAttachment`). */
function ViewerAttachment({ target, back }: { target: AttachmentTarget; back: Back }) {
  const { data } = useQuery(getTaskAttachments, { taskId: target.taskId })
  const attachment = ((data ?? []) as Attachment[]).find(a => a.id === target.id)
  const name = attachment?.fileName ?? 'Attachment'
  const source = useMemo(
    () => ({ key: `attachment:${target.id}`, open: () => openAttachmentThroughHq(target.id) }),
    [target.id],
  )
  const link = linkOf(target)
  const reference = attachment
    ? writeTaskReference({ kind: 'attachment', task: target.taskKey, name: attachment.fileName })
    : undefined
  return (
    <OpenedFile
      key={target.id}
      file={null} reference={reference} kind="files" path={name}
      breadcrumb={[target.taskKey, 'Attachments']} back={back}
      link={link?.names ?? {}} linkBase={link?.base} source={source}
      notThere={{ words: `This attachment isn't on ${target.taskKey} any more.` }}
    />
  )
}
