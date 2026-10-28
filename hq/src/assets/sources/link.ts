/**
 * A link (spec part 3 *Sources*; security review M3): the package fetched through the guarded fetch
 * (`urlFetch.ts`), with the signature beside it, then read as an upload's ZIP is. A person is shown only the fetch
 * refusal's own message, and every failure to read what came back says the same thing, so a link's answer can't
 * tell "not a ZIP" from any other failure.
 */
import { AssetFileListError } from '@agenthix/core'
import { PackageReadError, readZipPackage } from '../install/archive'
import type { Arrival } from '../install/types'
import { fetchPackageFromUrl, UrlFetchRefused, type UrlFetchOptions } from './urlFetch'

export const LINK_UNREADABLE =
  "What that link holds isn't a package HQ can read. Check that it links to the package's ZIP file, then try again. Nothing was changed."

/** The fetch refused: its message is the one a person sees, unchanged. */
export class LinkRefusal extends PackageReadError {}

/** The link as it is recorded: what the person gave, less any fragment. */
function recordedLink(link: string): string {
  const url = new URL(link)
  url.hash = ''
  return url.href
}

export async function linkArrival(link: unknown, options: UrlFetchOptions = {}): Promise<Arrival> {
  let fetched
  try {
    fetched = await fetchPackageFromUrl(typeof link === 'string' ? link : '', options)
  } catch (err) {
    if (err instanceof UrlFetchRefused) throw new LinkRefusal(err.message)
    throw err
  }
  const bundle = fetched.signature ? Buffer.from(fetched.signature) : null
  return sameReadError(async () => ({
    source: 'url' as const,
    arrived: await readZipPackage(Buffer.from(fetched.bytes)),
    bundle,
    sourceUrl: recordedLink(link as string),
  }))
}

/** Every failure to read a link's package becomes the one message; a fetch refusal and anything else pass unchanged. */
export async function sameReadError<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    if (err instanceof LinkRefusal) throw err
    if (err instanceof PackageReadError || err instanceof AssetFileListError) throw new PackageReadError(LINK_UNREADABLE)
    throw err
  }
}
