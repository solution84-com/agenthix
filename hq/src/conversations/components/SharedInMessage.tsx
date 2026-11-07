import { SHARED_FOLDER, sharedFilesOf, type SharedFile } from '@agenthix/core'
import { EmbeddedImage } from '../../shared/components/markdownEmbed/EmbedParts'
import { FileChip } from '../../shared/components/markdownEmbed/FileChip'
import { refOfReference } from '../../storage/pages/fileReferences'
import { useConversationEmbed } from './conversationFiles'

/** Under a person's message whose pictures the model could not see: which model, and that the agent had the files. */
export function unseenWords(model: string, agentName: string, pictures: number): string {
  return `${model} couldn't see the ${pictures === 1 ? 'image' : 'images'}. ${agentName} got the ${pictures === 1 ? 'file' : 'files'}, not what is in ${pictures === 1 ? 'it' : 'them'}.`
}

/**
 * The photos and files a person added to their message, as they were kept in the conversation's place: a picture as a
 * thumbnail, opened beside the thread on a click, and any other file as its chip. Outside a conversation, their names.
 */
export function SharedInMessage({ shared, writtenAt }: { shared: unknown; writtenAt?: string }) {
  const files = sharedFilesOf(shared)
  const embed = useConversationEmbed(writtenAt)
  if (files.length === 0) return null
  const owner = embed?.place.space === 'owner' ? embed.place.owner : null
  const refOf = (f: SharedFile) => (owner ? refOfReference(owner, ['files', SHARED_FOLDER, f.name]) : null)
  return (
    <ul aria-label="Added to the message" data-testid="shared-in-message" className="mb-1.5 flex flex-wrap justify-end gap-1.5">
      {files.map(f => {
        const ref = refOf(f)
        return (
          <li key={f.name} className="max-w-full [&_img]:max-h-40 [&_img]:max-w-60">
            {!ref || !embed ? <span className="text-small text-text-secondary">{f.name}</span>
              : f.kind === 'image' ? <EmbeddedImage fileRef={ref} name={f.name} alt={f.name} context={embed} />
              : <FileChip fileRef={ref} context={embed}>{f.name}</FileChip>}
          </li>
        )
      })}
    </ul>
  )
}
