import {
  APP_SERVE_METHOD, BUNDLE_METHODS, FILES_SERVE_METHOD, LOCATION_FILE_METHODS, PACKAGE_METHODS, PREVIEW_METHODS,
  type SiteContentMethodName,
} from '@agenthix/core'
import type { ContentStream } from './contentStream'
import { handlePackagesPut } from '../../../packages/packageMethods'
import { handleArtefactRead, handleKnowledgeRead, handleLocationRead } from './locationReadHandler'
import { previewConnectGone } from '../previewGone'
import { handleWriteSkill } from '../../storage/skillFolderWrite'
import { refuseFilesServeFromHq, refuseRelayStreamFromHq } from '../../relay/filesServeFromHq'

/**
 * The streams this site serves (ADR-0051: named methods, never a generic
 * relay). A method not listed here is refused with `unknown_method`.
 *
 * Every handler here must END ITS OWN WRITABLE HALF and must not read its
 * request with `for await`, which destroys the stream before it can reply.
 * Both handlers below say so in their own headers; a third should too.
 */
export type ContentHandler = (stream: ContentStream, params: unknown) => Promise<void>

/** One handler per stream of core's `SiteContentMethods`, so a stream hq opens that this site does not serve fails the typecheck. */
export const contentMethods: Readonly<Record<SiteContentMethodName, ContentHandler>> = Object.freeze({
  [PACKAGE_METHODS.put]: handlePackagesPut,
  // A location's file bytes, whatever the file's size. The listings, stats and
  // seeds that go with it are control-channel methods (../channelMethods.ts).
  [LOCATION_FILE_METHODS.readFile]: handleLocationRead,
  // An owner's artefacts and knowledge sit beside its files rather than in a
  // location, so each gets its own name rather than a flag on the read above.
  [LOCATION_FILE_METHODS.readArtefact]: handleArtefactRead,
  [LOCATION_FILE_METHODS.readKnowledge]: handleKnowledgeRead,
  // One of a place's skill folders replaced by the files streamed (1.11); removing one is a control method.
  [LOCATION_FILE_METHODS.writeSkill]: handleWriteSkill,
  // The old preview path's stream, deprecated since 1.12: ended unread (`../previewGone.ts`).
  [PREVIEW_METHODS.connect]: previewConnectGone,
  // A file for a browser, on a ticket (adr-0153). Served only on a relay's line, where the handler knows which relay
  // the ticket must name (`../../relay/relayLines.ts`); hq carries no file bytes, so here it is refused.
  [FILES_SERVE_METHOD]: refuseFilesServeFromHq,
  // A live app's traffic and a bundle's bytes travel only on a relay's line, whose relay the ticket must name
  // (`../../relay/relayLines.ts`); asked on hq's own channel, each is refused unread.
  [APP_SERVE_METHOD]: refuseRelayStreamFromHq,
  [BUNDLE_METHODS.read]: refuseRelayStreamFromHq,
  [BUNDLE_METHODS.write]: refuseRelayStreamFromHq,
})
