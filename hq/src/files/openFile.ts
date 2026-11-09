/**
 * Opening a file (spec part 1, *Opening a file*, steps 2–4): hq checks the person may read it, finds the site that
 * holds it and that site's relay, asks the site about it, chooses its kind, and signs a preview and a download ticket
 * — or answers the state the frame words (part 2, F4). No content crosses hq: only the site's facts.
 *
 * Order is the security property: access before anything is asked of a site (adr-0042), and a relay that is not
 * connected answered at once, before the site is asked and before anything is signed (D17: there is no fallback).
 */
import {
  chooseFileKind, fileTicketLink, needsFilesAddress,
  type FileAboutResult, type FileFacts, type FileOpenAnswer, type FileTicketInput, type RelayAddress,
  type SiteFileRef, type TicketPurpose,
} from '@agenthix/core'
import type { SignedRelayToken } from '../relays/relayTokens'

/** Why a step could not be taken, as the answer's state. */
export class OpenRefused extends Error {
  constructor(readonly state: 'not-found' | 'site-unavailable') {
    super(state)
    this.name = 'OpenRefused'
  }
}

export type SiteAndRelay = {
  siteId: string
  /** As a person sees it (`displaySiteName`). */
  siteName: string
  relay: { id: string; name: string; isHq: boolean; address: string | null; usable: boolean } | null
}

export interface OpenFileDeps {
  /** Throws `OpenRefused('not-found')` when the person may not read the file's owner; may return the ref normalised. */
  checkAccess(ref: SiteFileRef, userId: string): Promise<SiteFileRef>
  /** The logical id of the site that holds it. */
  siteFor(ref: SiteFileRef): Promise<string>
  siteAndRelay(siteId: string): Promise<SiteAndRelay | null>
  isRelayConnected(relayId: string): boolean
  /** The site's facts; throws `OpenRefused('site-unavailable')` when it can't answer. */
  about(siteId: string, ref: SiteFileRef): Promise<FileAboutResult>
  browserAddressOf(relay: { isHq: boolean; address: string | null }): RelayAddress | null
  issue(input: FileTicketInput): Promise<SignedRelayToken>
}

/**
 * The person's access, then the site that holds the file: the one check every way of reading a file passes first
 * (the open, and a chip's facts). Throws `OpenRefused` for a refusal.
 */
export async function locateFile(requested: SiteFileRef, userId: string, deps: Pick<OpenFileDeps, 'checkAccess' | 'siteFor'>) {
  const ref = await deps.checkAccess(requested, userId)
  return { ref, siteId: await deps.siteFor(ref) }
}

/** The facts a person sees of a file the site described, with the kind core chooses. */
export function factsOfAbout(about: Extract<FileAboutResult, { ok: true }>): FileFacts {
  const choice = chooseFileKind(about.name, about.looksLikeText)
  return {
    name: about.name, size: about.size, version: about.version, contentType: choice.contentType, kind: choice.kind,
    ...(choice.language ? { language: choice.language } : {}),
  }
}

export async function openFile(requested: SiteFileRef, userId: string, deps: OpenFileDeps): Promise<FileOpenAnswer> {
  try {
    const { ref, siteId } = await locateFile(requested, userId, deps)
    const held = await deps.siteAndRelay(siteId)
    if (!held) return { state: 'not-found' }
    const { relay } = held
    if (!relay || !relay.usable) return { state: 'no-relay', siteName: held.siteName }
    const address = deps.browserAddressOf(relay)
    if (!address || !deps.isRelayConnected(relay.id)) {
      return { state: 'relay-unavailable', siteName: held.siteName, relayName: relay.name }
    }

    const about = await deps.about(siteId, ref)
    if (!about.ok) return { state: about.refusal === 'linked' ? 'linked' : 'not-found' }
    const facts = factsOfAbout(about)

    const ticket = (purpose: TicketPurpose) =>
      deps.issue({ ...ref, purpose, version: about.version, person: userId, site: siteId, relay: relay.id })
    const download = await ticket('download')
    const downloadLink = fileTicketLink(address, download.token)
    if (needsFilesAddress(facts.kind) && address.door === 'bare-address') {
      return { state: 'no-files-address', facts, downloadLink, expiresAt: download.expiresAt }
    }
    const preview = await ticket('preview')
    return {
      state: 'ready', facts, downloadLink,
      previewLink: fileTicketLink(address, preview.token),
      expiresAt: Math.min(download.expiresAt, preview.expiresAt),
    }
  } catch (err) {
    if (err instanceof OpenRefused) return { state: err.state }
    throw err
  }
}
