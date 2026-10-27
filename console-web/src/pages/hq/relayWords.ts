import type { HqRelay } from '@agenthix/core'
import { MB, GB } from '../dashboard/words'

/** The words for a file address HQ does not have: the relay answers on HQ's own address, where a PDF cannot be previewed. */
export const OWN_ADDRESS_WORDS = "Answering on hq's own address: PDF preview is off."

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Bytes as people read them: "38 MB", "1.2 GB", "under 1 MB" for a little. */
export function trafficOf(bytes: number): string {
  if (bytes >= GB) return `${Math.round((bytes / GB) * 10) / 10} GB`
  if (bytes >= MB) return `${Math.round(bytes / MB)} MB`
  return bytes === 0 ? 'none' : 'under 1 MB'
}

export function servesLine(r: HqRelay): string {
  return r.sites === null ? 'Not reported yet' : plural(r.sites, 'site', 'sites')
}

/** What it carried since it started, since a relay reports no further back. */
export function trafficLine(r: HqRelay): string {
  return r.bytesCarried === null ? 'Not reported yet' : `${trafficOf(r.bytesCarried)} since it started`
}

export function streamsLine(r: HqRelay): string {
  return r.openStreams === null ? 'Not reported yet' : `${r.openStreams} open now`
}

/** The Dashboard's words for a relay that is not answering: what it means for people, who holds it, what to do. */
export const RELAY_NOT_ANSWERING = {
  title: "HQ's relay isn't answering",
  text: "Files in HQ can't be opened until it answers. It runs with HQ, so check that HQ is running on its machine; if it is, restart HQ.",
} as const
