import { PACKAGE_MAX_BYTES } from '@agenthix/core'
import { isPublicAddress } from './publicAddress'
import { connectPinned, resolveAll } from './pinnedHttps'

/**
 * Fetching a package from a link a person gave (spec part 3 *Sources*, security review M3). The link is hostile
 * input aimed at hq's own network: only https on the standard port, the host resolved once and the connection
 * pinned to that address, every address that is not public on the internet refused before anything connects, each
 * redirect checked the same way (at most 3), the body streamed under a cap within a total time, and nothing sent
 * but `accept` headers. Every failure on the way says the same thing, so the answer cannot be used to map what hq
 * can reach. The signature is fetched under the same rules from `<link>.sigstore.json`.
 */

export type ResolvedAddress = { address: string; family: 4 | 6 }
export type Resolve = (hostname: string) => Promise<ResolvedAddress[]>
export type HttpResponse = {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: AsyncIterable<Uint8Array>
  close(): void
}
/** One GET to `url`, connected to `address` and never to anything else the name might resolve to. */
export type Connect = (request: {
  url: URL
  address: ResolvedAddress
  headers: Record<string, string>
  signal: AbortSignal
}) => Promise<HttpResponse>

export type UrlFetchOptions = { resolve?: Resolve; connect?: Connect; timeoutMs?: number }
export type FetchedPackage = { bytes: Uint8Array; signature: Uint8Array | null; finalUrl: string }

/**
 * `reason` is for hq's own tests and logs; a person is shown `message` only. Every network failure is
 * `unreachable`, with one message.
 */
export type UrlFetchRefusalReason = 'not-a-link' | 'not-https' | 'credentials' | 'port' | 'too-large' | 'unreachable'

export class UrlFetchRefused extends Error {
  constructor(readonly reason: UrlFetchRefusalReason, message: string) {
    super(message)
    this.name = 'UrlFetchRefused'
  }
}

const MAX_REDIRECTS = 3
const DEFAULT_TIMEOUT_MS = 60_000
/** A Sigstore bundle is a few kilobytes; anything near this is not one. */
const SIGNATURE_MAX_BYTES = 1024 * 1024
const REDIRECTS = new Set([301, 302, 303, 307, 308])
const ABSENT = new Set([404, 410])
const HEADERS = { accept: 'application/zip, application/octet-stream, */*', 'accept-encoding': 'identity' }

const MESSAGES: Record<UrlFetchRefusalReason, string> = {
  'not-a-link': 'That is not a link. Give the package\'s full address, starting with https://. Nothing was changed.',
  'not-https': 'HQ installs only from https:// links, so the package cannot be read or altered on the way. Give the package\'s https:// address. Nothing was changed.',
  credentials: 'The link carries a user name or password, and HQ never sends credentials when it fetches a package. Give a link without them. Nothing was changed.',
  port: 'HQ fetches packages only from the standard https port. Give a link without a port number. Nothing was changed.',
  'too-large': `The package at that link is larger than ${PACKAGE_MAX_BYTES / (1024 * 1024)} MB, the most a package may carry. Ask its publisher for a smaller package, or install it another way. Nothing was changed.`,
  unreachable: 'HQ could not fetch a package from that link. Check that it is a public https:// link to the package, and that the server holding it is up, then try again. Nothing was changed.',
}

const refuse = (reason: UrlFetchRefusalReason) => new UrlFetchRefused(reason, MESSAGES[reason])

export async function fetchPackageFromUrl(link: string, options: UrlFetchOptions = {}): Promise<FetchedPackage> {
  const url = checkLink(link)
  const deps = {
    resolve: options.resolve ?? resolveAll,
    connect: options.connect ?? connectPinned,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  }
  const fetched = await fetchOne(url, PACKAGE_MAX_BYTES, deps)
  if (!fetched) throw refuse('unreachable')

  const signatureUrl = new URL(url.href)
  signatureUrl.pathname = `${signatureUrl.pathname}.sigstore.json`
  // A signature that is there but cannot be read must not turn into "unsigned": only a plain "not found" does.
  const signature = await fetchOne(signatureUrl, SIGNATURE_MAX_BYTES, deps).catch(() => {
    throw refuse('unreachable')
  })
  return { bytes: fetched.bytes, signature: signature?.bytes ?? null, finalUrl: fetched.finalUrl }
}

/** The person's link, checked before anything is resolved. A fragment is never sent. */
function checkLink(link: string): URL {
  let url: URL
  try {
    url = new URL(link.trim())
  } catch {
    throw refuse('not-a-link')
  }
  const problem = linkProblem(url)
  if (problem) throw refuse(problem)
  url.hash = ''
  return url
}

function linkProblem(url: URL): UrlFetchRefusalReason | null {
  if (url.protocol !== 'https:') return 'not-https'
  if (url.username || url.password) return 'credentials'
  if (url.port !== '') return 'port'
  return null
}

type Deps = { resolve: Resolve; connect: Connect; timeoutMs: number }

/** The bytes at `start`, following redirects; null when the end of the chain says the file is not there. */
async function fetchOne(start: URL, maxBytes: number, deps: Deps): Promise<{ bytes: Uint8Array; finalUrl: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs)
  const timedOut = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(refuse('unreachable')), { once: true })
  })
  timedOut.catch(() => {})
  try {
    let url = start
    for (let redirects = 0; ; redirects++) {
      const address = await Promise.race([pinnedAddress(url, deps.resolve), timedOut])
      const response = await Promise.race([
        deps.connect({ url, address, headers: { ...HEADERS }, signal: controller.signal }),
        timedOut,
      ]).catch((error: unknown) => {
        throw error instanceof UrlFetchRefused ? error : refuse('unreachable')
      })
      if (REDIRECTS.has(response.status)) {
        response.close()
        if (redirects >= MAX_REDIRECTS) throw refuse('unreachable')
        url = redirectTarget(url, response.headers.location)
        continue
      }
      if (response.status !== 200) {
        response.close()
        if (ABSENT.has(response.status)) return null
        throw refuse('unreachable')
      }
      const declared = Number(header(response.headers['content-length']))
      if (Number.isFinite(declared) && declared > maxBytes) {
        response.close()
        throw refuse('too-large')
      }
      const bytes = await readCapped(response, maxBytes, timedOut)
      return { bytes, finalUrl: url.href }
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

/** Resolves the host once and returns the address to connect to, or refuses unless every address is public. */
async function pinnedAddress(url: URL, resolve: Resolve): Promise<ResolvedAddress> {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  let addresses: ResolvedAddress[]
  if (isLiteralAddress(host)) {
    addresses = [{ address: host, family: host.includes(':') ? 6 : 4 }]
  } else {
    try {
      addresses = await resolve(host)
    } catch {
      throw refuse('unreachable')
    }
  }
  // Any private answer refuses the name: a host that mixes them is the shape of a DNS rebinding attempt.
  if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address))) throw refuse('unreachable')
  return addresses[0]
}

// The URL parser has already turned decimal, octal, hex and shortened IPv4 hosts into dotted form.
const isLiteralAddress = (host: string) => /^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')

function redirectTarget(from: URL, location: string | string[] | undefined): URL {
  const value = header(location)
  if (!value) throw refuse('unreachable')
  let next: URL
  try {
    next = new URL(value, from)
  } catch {
    throw refuse('unreachable')
  }
  if (linkProblem(next)) throw refuse('unreachable')
  next.hash = ''
  return next
}

const header = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

async function readCapped(response: HttpResponse, maxBytes: number, timedOut: Promise<never>): Promise<Uint8Array> {
  const iterator = response.body[Symbol.asyncIterator]()
  const parts: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const next = await Promise.race([iterator.next(), timedOut]).catch(() => {
        throw refuse('unreachable')
      })
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) throw refuse('too-large')
      parts.push(next.value)
    }
  } finally {
    response.close()
    void iterator.return?.()?.catch?.(() => {})
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return bytes
}
