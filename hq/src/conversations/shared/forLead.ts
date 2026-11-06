/**
 * A person's shared photos and files as the lead reads them: the words always name each file where it is kept, so the
 * agent can open it and hand it on whatever the model sees; the pictures themselves go beside the words only when the
 * turn gives them (`coordinator/turnImages.ts`).
 */
import { sharedReference, type SharedFile } from '@agenthix/core'
import type { LeadMessage, LeadShared } from '../contract'

export function sharedNote(files: readonly SharedFile[]): string {
  const named = files.map(f => `${sharedReference(f.name)}${f.kind === 'image' ? ' (a picture)' : ''}`)
  return `[Shared with this message, in the place's files: ${named.join(', ')}]`
}

/** The person's words with the note of what they shared, and the entries a turn reads the pictures from. */
export function withShared(said: string, messageId: string, files: readonly SharedFile[]): { content: string; shared?: LeadShared[] } {
  if (files.length === 0) return { content: said }
  const note = sharedNote(files)
  return {
    content: said.trim() ? `${said}\n\n${note}` : note,
    shared: files.map(f => ({ messageId, name: f.name, kind: f.kind })),
  }
}

/** One side's run of messages joined into one, keeping every message's shared files. */
export function joinLead(last: LeadMessage, next: LeadMessage): LeadMessage {
  const content = `${(last as { content: string }).content}\n\n${(next as { content: string }).content}`
  if (last.role !== 'user' || next.role !== 'user') return { ...last, content } as LeadMessage
  const shared = [...(last.shared ?? []), ...(next.shared ?? [])]
  return { ...last, content, ...(shared.length > 0 && { shared }) }
}
