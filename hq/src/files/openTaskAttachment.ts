/**
 * Opening a task's attachment beside the task (spec part 3, *A task's files*): an attachment is an upload hq keeps on
 * its own disk, served by hq's relay (D18). hq checks access by the same rule `/file-link` applies (`uploadAccess`: a
 * member of the task's project, the file a plain file where the relay will read it), chooses its kind from its name
 * and its first bytes, and signs a preview and a download ticket — the same answer the frame takes from `openFile`.
 *
 * Order is the security property, as in `openFile`: access before anything else, and hq's relay checked before any
 * byte is looked at or any ticket signed. Only the attachment's facts leave hq; its bytes are the relay's to carry.
 */
import {
  chooseFileKind, fileTicketLink, fileVersion, needsFilesAddress,
  type FileFacts, type FileOpenAnswer, type FileTicketInput, type RelayAddress, type TicketPurpose,
} from '@agenthix/core'
import type { SignedRelayToken } from '../relays/relayTokens'

/** How the frame names where an attachment is when hq's relay isn't answering: "Files on HQ can't be opened right now: hq-box · HQ's relay isn't answering." */
export const HQ_AS_SITE = 'HQ'

export type AttachmentFile = { path: string; name: string }
export type UploadStat = { size: number; mtimeMs: number }

export interface OpenTaskAttachmentDeps {
  /** The attachment's upload path in its decoded form and its file name; null when there is no such attachment. */
  find(attachmentId: string): Promise<AttachmentFile | null>
  /** `uploadAccess`: the file's stat when this person may open it, null otherwise (never saying which). */
  access(uploadPath: string, userId: string): Promise<UploadStat | null>
  /** hq's relay while it is connected and has an address a browser reaches; null otherwise. */
  hqRelay(): Promise<{ id: string; address: RelayAddress } | null>
  /** hq's relay as people read its name, "hq-box · HQ's relay", the same name a site's file gives it. */
  hqRelayName(): string
  /** Whether the file's first bytes look like text, read on hq's disk. */
  looksLikeText(uploadPath: string): Promise<boolean>
  issue(input: FileTicketInput): Promise<SignedRelayToken>
}

export async function openTaskAttachment(attachmentId: string, userId: string, deps: OpenTaskAttachmentDeps): Promise<FileOpenAnswer> {
  const file = await deps.find(attachmentId)
  if (!file) return { state: 'not-found' }
  const stat = await deps.access(file.path, userId)
  if (!stat) return { state: 'not-found' }
  const relay = await deps.hqRelay()
  if (!relay) return { state: 'relay-unavailable', siteName: HQ_AS_SITE, relayName: deps.hqRelayName() }

  const version = fileVersion(stat.size, stat.mtimeMs)
  const choice = chooseFileKind(file.name, await deps.looksLikeText(file.path))
  const facts: FileFacts = {
    name: file.name, size: stat.size, version, contentType: choice.contentType, kind: choice.kind,
    ...(choice.language ? { language: choice.language } : {}),
  }

  const ticket = (purpose: TicketPurpose) =>
    deps.issue({ space: 'upload', path: file.path, purpose, version, person: userId, relay: relay.id })
  const download = await ticket('download')
  const downloadLink = fileTicketLink(relay.address, download.token)
  if (needsFilesAddress(choice.kind) && relay.address.door === 'bare-address') {
    return { state: 'no-files-address', facts, downloadLink, expiresAt: download.expiresAt }
  }
  const preview = await ticket('preview')
  return {
    state: 'ready', facts, downloadLink,
    previewLink: fileTicketLink(relay.address, preview.token),
    expiresAt: Math.min(download.expiresAt, preview.expiresAt),
  }
}
