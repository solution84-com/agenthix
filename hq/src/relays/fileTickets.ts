/**
 * The one way a file ticket leaves hq (T11): signed by `signFileTicket`, then recorded as a `FileOpened` row, and only
 * then handed back. A ticket whose row could not be written is never returned, so no browser holds a ticket hq has no
 * record of. The open operation (files/) and hq's uploads both issue their tickets here.
 */
import { prisma } from 'wasp/server'
import type { FileTicketInput } from '@agenthix/core'
import { signFileTicket, type SignedRelayToken } from './relayTokens'

/** The `FileOpened` row for a ticket: who, which file at which version, for what, through which relay. */
export type FileOpenedEntry = {
  personId: string | null
  space: string
  ownerType: string | null
  ownerId: string | null
  workspaceId: string | null
  taskId: string | null
  path: string
  pageVersionId: string | null
  version: string
  purpose: string
  siteId: string | null
  relayId: string
}

export function fileOpenedEntry(input: FileTicketInput): FileOpenedEntry {
  const common = { personId: input.person, version: input.version, purpose: input.purpose, relayId: input.relay }
  const none = { ownerType: null, ownerId: null, workspaceId: null, taskId: null, pageVersionId: null }
  switch (input.space) {
    case 'place':
      return {
        ...common, ...none, space: 'place', siteId: input.site, path: input.path,
        ownerType: input.loc.ownerType, ownerId: input.loc.ownerId,
        workspaceId: input.loc.workspaceId ?? null, taskId: input.loc.taskId ?? null,
      }
    case 'artefact':
      return { ...common, ...none, space: 'artefact', siteId: input.site, path: input.name, ownerType: input.owner.ownerType, ownerId: input.owner.ownerId }
    case 'knowledge':
      return {
        ...common, ...none, space: 'knowledge', siteId: input.site, path: input.path,
        ownerType: input.owner.ownerType, ownerId: input.owner.ownerId, pageVersionId: input.versionId ?? null,
      }
    case 'upload':
      return { ...common, ...none, space: 'upload', siteId: null, path: input.path }
  }
}

export type TicketIssuerDeps = {
  sign(input: FileTicketInput): Promise<SignedRelayToken>
  record(entry: FileOpenedEntry): Promise<void>
}

export function createTicketIssuer(deps: TicketIssuerDeps) {
  return async function issueFileTicket(input: FileTicketInput): Promise<SignedRelayToken> {
    const signed = await deps.sign(input)
    await deps.record(fileOpenedEntry(input))
    return signed
  }
}

/** Signs a file ticket and records it; the only function outside relays/ that should make one. */
export const issueFileTicket = createTicketIssuer({
  sign: signFileTicket,
  record: async entry => { await prisma.fileOpened.create({ data: entry }) },
})
