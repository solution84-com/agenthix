import { encodeStreamHead, refusalHead } from '@agenthix/core'
import type { ContentHandler } from '../hq/content/contentMethods'

/**
 * `files.serve` asked on hq's own content channel. hq carries no file bytes (adr-0153), and a ticket must name the
 * relay whose line it arrives on, which this channel is not, so it is refused as an invalid ticket without being read.
 */
export const refuseFilesServeFromHq: ContentHandler = stream =>
  new Promise(resolve => {
    stream.once('close', () => resolve())
    stream.end(Buffer.from(encodeStreamHead(refusalHead('ticket-invalid'))), () => resolve())
  })
