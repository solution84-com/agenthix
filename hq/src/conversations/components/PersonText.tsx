import { Fragment } from 'react'
import { FileChip, LinkChip } from '../../shared/components/markdownEmbed/FileChip'
import { TaskChip } from '../../shared/components/markdownEmbed/TaskChip'
import { taskReferenceOf } from '../../shared/taskReferences'
import { readStableLink, referenceLabel, refOfReference, splitReferences } from '../../storage/pages/fileReferences'
import { useConversationEmbed } from './conversationFiles'

/**
 * A person's message as they wrote it, with the paths Mention put in it and the stable links they pasted shown as
 * chips (spec part 3, *Chips in conversations*). The text itself is unchanged: the agent receives the paths.
 */
export function PersonText({ text, writtenAt }: { text: string; writtenAt?: string }) {
  const embed = useConversationEmbed(writtenAt)
  if (!embed || embed.place.space !== 'owner') return <>{text}</>
  const owner = embed.place.owner
  const origin = typeof window === 'undefined' ? null : window.location.origin
  return <>
    {splitReferences(text, origin).map((piece, i) => {
      if (piece.kind === 'text') return <Fragment key={i}>{piece.text}</Fragment>
      if (piece.kind === 'reference') {
        const decoded = partsOf(piece.reference)
        const task = decoded && taskReferenceOf(decoded)
        if (task) return <TaskChip key={i} taskRef={task} reference={piece.reference} context={embed} />
        const ref = refOfReference(owner, piece.reference.split('/').filter(Boolean))
        const folder = piece.reference.endsWith('/')
        return ref ? <FileChip key={i} fileRef={ref} context={embed} folder={folder}>{referenceLabel(piece.reference)}</FileChip> : <Fragment key={i}>{piece.reference}</Fragment>
      }
      const link = readStableLink(piece.href, origin ?? '')!
      const linkTask = taskReferenceOf(link.reference.split('/'))
      if (linkTask) return <TaskChip key={i} taskRef={linkTask} reference={link.reference} context={embed} />
      const ref = link.placePath === embed.placePath ? refOfReference(owner, link.reference.split('/')) : null
      return ref
        ? <FileChip key={i} fileRef={ref} context={embed}>{referenceLabel(link.reference)}</FileChip>
        : <LinkChip key={i} href={piece.href} reference={link.reference} />
    })}
  </>
}

/** A reference's parts, percent-decoded as a link's are (`my%20notes.md`); null when it can't be decoded. */
function partsOf(reference: string): string[] | null {
  try {
    return decodeURIComponent(reference).split('/').filter(Boolean)
  } catch {
    return null
  }
}
