import type { RelayLinkReport } from '@agenthix/core'

/** What hq keeps of a relay's report as its `load`: the report without the frame's type and version. */
export type RelayLoad = Omit<RelayLinkReport, 'type' | 'version'>

const MAX_SITES = 10_000
const id = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 128
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0

/** A `relay.report` frame read off the wire, every field checked; null for anything else. */
export function readRelayReport(text: string): RelayLoad | null {
  let frame: unknown
  try {
    frame = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) return null
  const f = frame as Record<string, unknown>
  if (f.type !== 'relay.report') return null
  if (typeof f.startedAt !== 'string' || f.startedAt.length > 64 || Number.isNaN(Date.parse(f.startedAt))) return null
  if (!Array.isArray(f.sites) || f.sites.length > MAX_SITES || !f.sites.every(id)) return null
  if (!count(f.openStreams) || !count(f.bytesCarried)) return null
  return { startedAt: f.startedAt, sites: [...f.sites], openStreams: f.openStreams, bytesCarried: f.bytesCarried }
}
