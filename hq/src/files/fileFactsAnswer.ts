import type { FileFacts } from '@agenthix/core'

/** What a chip is told of a file it names (`getFileFacts`): no link, so nothing to sign or record. */
export type FileFactsAnswer =
  | { state: 'ready'; facts: FileFacts }
  /** The person may read where it was, and the site says it isn't there (or isn't a file) any more. */
  | { state: 'gone' }
  /** The person may not read it, or its place or site is not one hq knows: never says whether it exists. */
  | { state: 'not-found' }
  | { state: 'site-unavailable' }
  /** The person may read where it is, and the site says it is a folder: a chip for it opens the Files tool there. */
  | { state: 'folder' }
  /** There, but hard-linked to another file, so the site won't show it: the chip is not gone, and opens to say why. */
  | { state: 'linked' }
