import { useMemo, useRef, useState } from 'react'
import type { FileOpenAnswer, SiteFileRef } from '@agenthix/core'
import { FileFrame, withMarkdown, type FileFrameProps } from '@agenthix/ui/files'
import { mentionInMessage } from '@agenthix/ui/sessions'
import { renderMarkdownIn, type MarkdownEmbedContext } from '../../shared/components/MarkdownMessage'
import { copyText as copy } from '../../shared/copyText'
import { useOpenAnswer, useOpenFile } from '../../files/useOpenFile'
import { mentionReference, referenceOf, type FilesToolKind } from './fileReferences'
import { FileNotThere, FullScreenFile, OpenFailed, stableLink, type NotThere } from './openedFileParts'
import { askToSaveAgain, changedOfAnswer, GONE_WORDS, useActionNotice } from './viewer/fileWords'
import { useAttentionWhen } from '@agenthix/ui/attention'

export interface OpenedFileProps {
  /** The file, as hq's *open* names it; null for one hq opens its own way (a task's attachment, through `source`). */
  file: SiteFileRef | null
  /** What Mention and Copy path give, where it is not the file's own reference (an attachment's). */
  reference?: string
  /** Which tool's folder it is in, for Mention and Copy path. */
  kind: FilesToolKind
  /** The path inside the tool's folder; for an artefact, its file name. */
  path: string
  /** Where it lives, above the title: ["Files", "reports"]. */
  breadcrumb: readonly string[]
  /** "‹ data", "‹ QR-1": back to where the person came from; none where the page itself is the way back. */
  back?: { label: string; onBack: () => void }
  /** The address's parameters that name this file, for Copy link: `{ tool: 'files', file: 'reports/q3.pdf' }`. */
  link: Record<string, string | null>
  /** Opens another file of the same place, from a link or an image in a Markdown file. */
  onOpenFile?: (ref: SiteFileRef) => void
  /** The place's address Copy link starts from, where the page is not the place's own (a conversation beside it). */
  linkBase?: string
  /** What a file that isn't there says. By default it was listed, so it "isn't here any more", with the folder it was in. */
  notThere?: NotThere
  /** Opens the folder a file that's gone was in; ‹ back when absent. */
  onOpenFolder?: () => void
  /** The Files tool: ▤ shows the folder beside the file (D1). */
  folderToggle?: FileFrameProps['folderToggle']
  /** A file opened where it was mentioned: ⋯ Show in Files opens its place's Files tool on it. */
  onShowInFiles?: () => void
  /**
   * Where the answer comes from when it is not hq's *open* (a file at a commit, read through Git): `key` names that
   * file and version, so a new key opens it afresh.
   */
  source?: { key: string; open: () => Promise<FileOpenAnswer> }
}

function embedPlace(file: SiteFileRef | null, path: string): Pick<MarkdownEmbedContext, 'place' | 'folder'> | null {
  if (!file) return null
  switch (file.space) {
    case 'place': return { place: { space: 'place', loc: file.loc }, folder: path.split('/').slice(0, -1).join('/') }
    case 'artefact': return { place: { space: 'artefact', owner: file.owner }, folder: '' }
    case 'knowledge': return { place: { space: 'knowledge', owner: file.owner }, folder: path.split('/').slice(0, -1).join('/') }
  }
}

/**
 * A file opened (spec part 2, *The frame*): hq opens it through its *open* action, and ui's frame draws it with the
 * renderer for its kind, Markdown through `MarkdownMessage` with the place's images embedded. hq supplies the one
 * header's actions — Copy link, Copy path, Mention, Show in Files, Full screen — and Ask the agent for a file that
 * can't be opened for the person's safety. The same component draws a file in the Files tool and in the file viewer.
 */
export function OpenedFile(props: OpenedFileProps) {
  const { file, kind, path, breadcrumb, back, link } = props
  const { source } = props
  const throughHq = useOpenFile(source ? null : file)
  const own = useOpenAnswer(source?.key ?? '', source?.open ?? null)
  const { answer, error, reopen } = source ? own : throughHq
  // A copy that worked says nothing; one that did not leaves the words to copy by hand, in the dialog.
  const [notice, say] = useActionNotice()
  const copyFailed = useAttentionWhen(notice ? `It could not be copied. Select and copy it here: ${notice}` : null, { title: 'Copy it by hand' })
  const [full, setFull] = useState(false)
  const onOpenFile = useRef(props.onOpenFile)
  onOpenFile.current = props.onOpenFile
  const name = path.split('/').pop() ?? path
  // What the agent sees: a workspace's file is under `workspaces/<id>/`, not `files/`.
  const reference = props.reference ?? (file ? referenceOf(file) ?? mentionReference(kind, path) : null)

  // A file with no folder of its own (an attachment) resolves no images or links in its Markdown.
  const embedded = embedPlace(file, path)
  const placeKey = embedded ? JSON.stringify(embedded.place) : ''
  const folder = embedded?.folder ?? ''
  const canOpen = !!props.onOpenFile
  const registry = useMemo(
    () => withMarkdown(renderMarkdownIn(placeKey ? {
      place: JSON.parse(placeKey) as MarkdownEmbedContext['place'],
      folder,
      onOpen: canOpen ? ref => onOpenFile.current?.(ref) : undefined,
    } : undefined)),
    [placeKey, folder, canOpen],
  )

  // No message box is open beside the file (the conversations list): keep the words where they can be pasted.
  const intoMessage = async (words: string, copied: string) => {
    if (mentionInMessage(words)) return
    if (!(await copy(words))) say(words)
  }

  if (error) return <OpenFailed name={name} error={error} back={back} onRetry={reopen} />

  if (answer?.state === 'not-found') {
    const where = breadcrumb.join(' › ')
    const notThere = props.notThere ?? {
      words: where ? `${GONE_WORDS} It was in ${where}.` : GONE_WORDS,
      action: where && (props.onOpenFolder ?? back) ? { label: `Open ${breadcrumb[breadcrumb.length - 1]}`, onAction: props.onOpenFolder ?? back!.onBack } : undefined,
    }
    return <FileNotThere name={name} breadcrumb={breadcrumb} back={back} notThere={notThere} />
  }

  const frame: FileFrameProps = {
    answer, name, breadcrumb, registry,
    changed: changedOfAnswer(answer),
    onMention: reference ? () => void intoMessage(reference, `Copied ${reference}. Paste it into a message.`) : undefined,
    // A file with no address of its own to link to (one of a task in Your space) has no Copy link.
    onCopyLink: Object.values(link).some(Boolean) ? async () => {
      const address = stableLink(link, props.linkBase)
      if (!(await copy(address))) say(address)
    } : undefined,
    onCopyPath: reference ? async () => { if (!(await copy(reference))) say(reference) } : undefined,
    onShowInFiles: props.onShowInFiles,
    onAsk: reference ? () => void intoMessage(askToSaveAgain(reference), 'Copied the request. Paste it into a message to the agent.') : undefined,
    onReopen: reopen,
  }
  if (full) {
    // In the Files tool full screen hides the folder: Show in Files puts the file back with its folder beside it.
    const toggle = props.folderToggle
    const showInFiles = props.onShowInFiles ?? (toggle ? () => { setFull(false); if (!toggle.shown) toggle.onToggle() } : undefined)
    return <>{copyFailed}<FullScreenFile frame={{ ...frame, onShowInFiles: showInFiles }} onClose={() => setFull(false)} /></>
  }
  return <>{copyFailed}<FileFrame {...frame} back={back} folderToggle={props.folderToggle} onFullScreen={() => setFull(true)} /></>
}
