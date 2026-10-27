import { useMemo, useRef, useState } from 'react'
import type { SiteFileRef } from '@agenthix/core'
import { FileFrame, withMarkdown, type FileFrameProps } from '@agenthix/ui/files'
import { mentionInMessage } from '@agenthix/ui/sessions'
import { changedLabel, type ListedEntry } from '@agenthix/ui/projects'
import { renderMarkdownIn, type MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import { copyText as copy } from '../../shared/copyText'
import { useOpenFile } from '../../files/useOpenFile'
import { mentionReference, referenceOf, type FilesToolKind } from './fileReferences'
import { FileGone, FullScreenFile, OpenFailed, stableLink } from './openedFileParts'

export interface OpenedFileProps {
  /** The file, as hq's *open* names it. */
  file: SiteFileRef
  /** Which tool's folder it is in, for Mention and Copy path. */
  kind: FilesToolKind
  /** The path inside the tool's folder; for an artefact, its file name. */
  path: string
  /** What the list knew of it: when it changed. */
  entry?: ListedEntry
  /** Where it lives, above the title when wide: ["Files", "reports"]. */
  breadcrumb: readonly string[]
  /** "Files", "Artefacts": where ‹ goes when narrow. */
  backLabel: string
  onBack: () => void
  layout: 'narrow' | 'wide'
  /** The address's parameters that name this file, for Copy link: `{ tool: 'files', file: 'reports/q3.pdf' }`. */
  link: Record<string, string | null>
  /** Opens another file of the same place, from a link or an image in a Markdown file. */
  onOpenFile?: (ref: SiteFileRef) => void
  /** The place's address Copy link starts from, where the page is not the place's own (a conversation beside it). */
  linkBase?: string
  /** Opens the folder a file that's gone was in; ‹ back when absent. */
  onOpenFolder?: () => void
}

function embedPlace(file: SiteFileRef, path: string): Pick<MarkdownEmbedContext, 'place' | 'folder'> {
  switch (file.space) {
    case 'place': return { place: { space: 'place', loc: file.loc }, folder: path.split('/').slice(0, -1).join('/') }
    case 'artefact': return { place: { space: 'artefact', owner: file.owner }, folder: '' }
    case 'knowledge': return { place: { space: 'knowledge', owner: file.owner }, folder: path.split('/').slice(0, -1).join('/') }
  }
}

/**
 * A file opened inside its tool (spec part 2, *The frame*): hq opens it through its *open* action, and ui's frame
 * draws it with the renderer for its kind, Markdown through `MarkdownMessage` with the place's images embedded. hq
 * supplies Mention, Copy link, Copy path and Open full screen.
 */
export function OpenedFile(props: OpenedFileProps) {
  const { file, kind, path, entry, breadcrumb, backLabel, onBack, layout, link } = props
  const { answer, error, reopen } = useOpenFile(file)
  const [notice, setNotice] = useState('')
  const [full, setFull] = useState(false)
  const onOpenFile = useRef(props.onOpenFile)
  onOpenFile.current = props.onOpenFile
  const name = path.split('/').pop() ?? path
  // What the agent sees: a workspace's file is under `workspaces/<id>/`, not `files/`.
  const reference = referenceOf(file) ?? mentionReference(kind, path)

  const { place, folder } = embedPlace(file, path)
  const placeKey = JSON.stringify(place)
  const canOpen = !!props.onOpenFile
  const registry = useMemo(
    () => withMarkdown(renderMarkdownIn({
      place: JSON.parse(placeKey) as MarkdownEmbedContext['place'],
      folder,
      onOpen: canOpen ? ref => onOpenFile.current?.(ref) : undefined,
    })),
    [placeKey, folder, canOpen],
  )

  const say = (words: string) => setNotice(words)
  const mention = async () => {
    if (mentionInMessage(reference)) { say(''); return }
    // No message box is open beside the tool (the conversations list): keep the reference where it can be pasted.
    say((await copy(reference)) ? `Copied ${reference} — paste it into a message.` : `Mention ${reference} in your message.`)
  }
  const copyLink = async () => {
    const address = stableLink(link, props.linkBase)
    say((await copy(address)) ? 'Link copied.' : address)
  }

  if (error) {
    return <OpenFailed name={name} error={error} layout={layout} backLabel={backLabel} onBack={onBack} onRetry={reopen} />
  }

  if (answer?.state === 'not-found') {
    return (
      <FileGone
        name={name} folder={breadcrumb} layout={layout} backLabel={backLabel} onBack={onBack}
        onOpenFolder={props.onOpenFolder ?? onBack}
      />
    )
  }

  const frame: FileFrameProps = {
    answer, name, breadcrumb, registry, notice,
    changed: entry?.modifiedAt ? `Changed ${changedText(entry.modifiedAt)}` : undefined,
    onMention: () => void mention(),
    onCopyLink: () => void copyLink(),
    onCopyPath: async () => { say((await copy(reference)) ? 'Path copied.' : reference) },
    onReopen: reopen,
  }
  if (full) return <FullScreenFile frame={frame} onClose={() => setFull(false)} />
  return <FileFrame {...frame} layout={layout} back={{ label: backLabel, onBack }} onFullScreen={() => setFull(true)} />
}

function changedText(modifiedAt: string): string {
  const label = changedLabel(modifiedAt)
  if (/^\d\d:\d\d$/.test(label)) return `today ${label}`
  return label === 'Yesterday' ? 'yesterday' : label
}
