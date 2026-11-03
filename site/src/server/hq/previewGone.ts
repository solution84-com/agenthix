/**
 * The old preview path's methods (`preview.start`, `preview.stop`, `preview.connect`), deprecated since site protocol
 * 1.12 and no longer called by hq: a live app now runs in a live preview (`../livePreviews/`). Until the protocol
 * drops them, each is answered as a preview this site does not know, and nothing runs.
 */
import { PreviewError } from '@agenthix/core'
import type { ContentHandler } from './content/contentMethods'

const GONE = 'This site runs apps in live previews only; open a live preview on the branch and start the app there.'

export async function previewGone(_params: unknown): Promise<never> {
  throw new PreviewError('not_found', GONE)
}

export const previewConnectGone: ContentHandler = stream =>
  new Promise(resolve => {
    stream.destroy()
    resolve()
  })
