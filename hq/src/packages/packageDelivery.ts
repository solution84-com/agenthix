/**
 * Delivery (ruling P1, ADR-0072): hq pushes; a site never asks. Before a run is
 * dispatched, resumed or previewed, the content of every package it loads is on
 * the site's disk, or the dispatch fails saying why. The site answers which
 * digests it lacks, so content reaches a site once per change and is reused
 * from its cache after that. hq serves exactly the digests the run named when
 * it started, even if the package has been edited since.
 */
import { prisma } from 'wasp/server'
import {
  PACKAGE_METHODS,
  type PackageRef, type PackagesMissingResult, type RunContextPayload, type RunPackages,
} from '@agenthix/core'
import { siteChannelRegistry, ChannelRequestFailed } from '../sites/channel'
import { openContentStream, ContentStreamFailed, type ContentStream } from '../sites/content'
import { SiteUnreachableError, reasonFor } from '../storage/workspaceStore'
import { readPackage, toTransfer } from './packageStore'
import { displaySiteName } from '../shared/siteName'

export const PACKAGE_PUT_TIMEOUT_MS = 60_000

export type PackageDeliveryCode = 'package_delivery_failed'

export class PackageDeliveryError extends Error {
  constructor(readonly code: PackageDeliveryCode, message: string) {
    super(message)
    this.name = 'PackageDeliveryError'
  }
}

const UNREACHABLE = new Set(['offline', 'timeout', 'disconnected'])

export function refsOf(packages: RunPackages): PackageRef[] {
  return [packages.agent, ...(packages.org ? [packages.org] : []), packages.platform]
}

/**
 * The installed and personal skill content a run names (skills spec part 5, *Delivery per turn*): one `skill` ref per
 * version, delivered like any package, so a site fetches each version once and reuses it for every agent and turn.
 */
export function skillRefsOf(context: Pick<RunContextPayload, 'installedSkills' | 'personSkills'>): PackageRef[] {
  const refs = [...(context.installedSkills ?? []), ...(context.personSkills ?? [])]
    .map(e => e.ref)
    .filter((r): r is PackageRef => r !== undefined)
  return [...new Map(refs.map(r => [r.digest, r])).values()]
}

async function siteRow(siteId: string) {
  return prisma.executionSite
    .findUnique({ where: { siteId }, select: { label: true, isDefault: true, status: true, protocolVersion: true } })
    .catch(() => null)
}

async function unreachable(siteId: string): Promise<SiteUnreachableError> {
  const site = await siteRow(siteId)
  return new SiteUnreachableError(site ? displaySiteName(site) : siteId, siteId, reasonFor(site?.status ?? null), site?.protocolVersion ?? null)
}

async function streamFailure(siteId: string, ref: PackageRef, err: unknown): Promise<Error> {
  if (err instanceof ContentStreamFailed && UNREACHABLE.has(err.code)) return unreachable(siteId)
  const message = err instanceof Error ? err.message : String(err)
  return new PackageDeliveryError(
    'package_delivery_failed',
    `Delivering the ${ref.kind} package ${ref.key} (content ${ref.digest.slice(0, 12)}) to Execution Site ${siteId} failed: ${message}`,
  )
}

/** What a `close` with no prior `error` (and no `end`) means: the site side went away mid-transfer. */
function closedWithoutAnswer(): ContentStreamFailed {
  return new ContentStreamFailed('The stream closed before the site answered', 'disconnected')
}

function sendAndAwaitEnd(stream: ContentStream, body: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    // A stream can already be destroyed/errored by the time this runs (e.g.
    // the mux failed synchronously while `openContentStream` was resolving) —
    // `destroyed`/`errored` are Node's own flags, set the moment `.destroy()`
    // was called, so checking them up front means never waiting out the full
    // timeout for an outcome that already happened.
    if (stream.errored) { reject(stream.errored); return }
    if (stream.destroyed) { reject(closedWithoutAnswer()); return }

    const timer = setTimeout(() => {
      stream.destroy()
      reject(new ContentStreamFailed(`No answer within ${PACKAGE_PUT_TIMEOUT_MS} ms`, 'timeout'))
    }, PACKAGE_PUT_TIMEOUT_MS)
    timer.unref?.()

    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }
    stream.on('error', err => settle(() => reject(err)))
    stream.on('end', () => settle(() => resolve()))
    // A close with no preceding error or end means the connection dropped
    // silently — mapped the same way a `disconnected`-coded stream failure
    // is (streamFailure below), not left to time out.
    stream.on('close', () => settle(() => reject(stream.errored ?? closedWithoutAnswer())))
    stream.resume()
    stream.end(body)
  })
}

async function putPackage(siteId: string, ref: PackageRef): Promise<void> {
  const body = Buffer.from(JSON.stringify(toTransfer(ref, await readPackage(ref))), 'utf-8')
  let stream: ContentStream
  try {
    stream = await openContentStream(siteId, PACKAGE_METHODS.put, { ref })
  } catch (err) {
    throw await streamFailure(siteId, ref, err)
  }
  try {
    await sendAndAwaitEnd(stream, body)
  } catch (err) {
    throw await streamFailure(siteId, ref, err)
  }
}

/** Every package the run loads, and `skills` beside them; each digest the site lacks is sent once. */
export async function deliverPackages(siteId: string, packages: RunPackages, skills: PackageRef[] = []): Promise<void> {
  const refs = [...new Map([...refsOf(packages), ...skills].map(r => [r.digest, r])).values()]
  let missing: string[]
  try {
    ;({ missing } = await siteChannelRegistry.request(siteId, PACKAGE_METHODS.missing, { refs }))
  } catch (err) {
    if (err instanceof ChannelRequestFailed && UNREACHABLE.has(err.code)) throw await unreachable(siteId)
    throw err
  }
  for (const ref of refs) {
    if (missing.includes(ref.digest)) await putPackage(siteId, ref)
  }
}
