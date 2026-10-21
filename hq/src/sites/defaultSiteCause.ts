/**
 * Why HQ's site is not connected, when hq cannot see it for itself (host-management spec §10). A
 * site that hq refuses, or that never reaches hq, says nothing hq can hear; the host service on hq's machine reads
 * the cause from the site and passes it on through hq's control socket, which only a process on hq's machine can
 * open. A cause from the closed set, never text: the words are hq's own. In memory, as the host service passes it
 * on again whenever it reads the machine's status.
 *
 * The list is `@agenthix/core`'s, shared with the site and the host service.
 */
import { parseSiteCause, SITE_CAUSES, type SiteCause } from '@agenthix/core'

export const DEFAULT_SITE_CAUSES = SITE_CAUSES
export type DefaultSiteCause = SiteCause

let reported: { cause: DefaultSiteCause; at: Date } | null = null

export function __resetDefaultSiteCauseForTests(): void {
  reported = null
}

/** Keeps a cause the host service reported, or clears it with `none`; anything else is refused and changes nothing. */
export function reportDefaultSiteCause(raw: string, now = new Date()): DefaultSiteCause | 'none' | null {
  if (raw === 'none') {
    reported = null
    return 'none'
  }
  const cause = parseSiteCause(raw)
  if (!cause) return null
  reported = { cause, at: now }
  return cause
}

export function currentDefaultSiteCause(): { cause: DefaultSiteCause; at: Date } | null {
  return reported
}

const SENTENCES: Record<DefaultSiteCause, string> = {
  secretTooShort: "Its pairing secret is shorter than HQ accepts, so it did not try to connect.",
  addressRefused: "It would not send its pairing secret to the address it was given for HQ.",
  credentialStore: "It cannot keep its credential: its own master key is missing or wrong.",
  credentialRefused: "HQ refused it: its pairing secret is not the one HQ expects.",
  versionMismatch: "HQ and the site run versions that do not work together.",
  unreachable: "It cannot reach HQ over the private network they share.",
}

export function causeSentence(cause: DefaultSiteCause): string {
  return SENTENCES[cause]
}
