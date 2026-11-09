/**
 * The ways a client may hear through now, in the order to try them (spec, One key for voice): the resolver's answer
 * first (the agent's own choice, else the organisation's, else Inworld when it works), then every other listening
 * provider that works, Inworld first. A token that cannot be minted on one falls to the next.
 *
 * A client says which services it can stream to. One that does not say (dictation, the mobile app) is built on
 * AssemblyAI alone, so it is never handed an Inworld token.
 */
import { AI_PROVIDER_VENDOR_INFO, providerStateWorks } from '@agenthix/core'
import { providerStore } from '../providers/store'
import { speechAccess, type SpeechAccess, type SpeechScope } from './speechAccess'
import { HEARING_VENDORS, isHearingVendor, listeningModelOf, type HearingVendor } from './voiceModels'

export const HEARS_BY_DEFAULT: readonly HearingVendor[] = ['assemblyai']

export type HearingWays = { ok: true; ways: SpeechAccess[] } | { ok: false; reason: string }

/** What a client sent as the services it can hear with: the known ones, in hq's order; none known is the default. */
export function hearsOf(sent: unknown): readonly HearingVendor[] {
  const named = Array.isArray(sent) ? sent.filter(isHearingVendor) : []
  const known = HEARING_VENDORS.filter(v => named.includes(v))
  return known.length ? known : HEARS_BY_DEFAULT
}

/** What a person reads when every provider that works is one this client cannot hear through. */
export function cannotHearHereText(hears: readonly HearingVendor[]): string {
  const names = hears.map(v => AI_PROVIDER_VENDOR_INFO[v].label).join(' or ')
  return `Listening here needs ${names}, which isn't set up. An organisation admin can add it.`
}

export async function hearingWays(agentId: string | null | undefined, scope: SpeechScope, hears: readonly HearingVendor[] = HEARS_BY_DEFAULT): Promise<HearingWays> {
  const first = await speechAccess('stt', agentId, scope)
  const ways: SpeechAccess[] = []
  if (first.ok && (hears as readonly string[]).includes(first.access.vendor)) ways.push(first.access)
  // A provider the caller named is used as it is or not at all.
  if (!scope.pick && first.ok) {
    const order = (v: string) => HEARING_VENDORS.indexOf(v as HearingVendor)
    const others = (await providerStore().list())
      .filter(p => isHearingVendor(p.vendor) && hears.includes(p.vendor) && p.id !== first.access.providerId && providerStateWorks(p.state))
      .sort((a, b) => order(a.vendor) - order(b.vendor))
    for (const p of others) {
      const other = await speechAccess('stt', agentId, { ...scope, pick: { providerId: p.id, model: listeningModelOf(p.vendor) } })
      if (other.ok) ways.push(other.access)
    }
  }
  if (ways.length) return { ok: true, ways }
  return { ok: false, reason: first.ok ? cannotHearHereText(hears) : first.reason }
}
