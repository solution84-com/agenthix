/**
 * What organisation admins are told about providers (models from one place, part 1; F5, M3). Fleet admins are told
 * nothing: providers are not theirs.
 *
 * - `provider_not_working`: one persistent notice per provider that is not working, which cannot be dismissed. It says
 *   what is down in the vendor's words, what depends on it, and where new work goes instead, and links to the
 *   provider's line. Each pass works out the whole state and makes the open notices match it, so one clears by itself
 *   once its provider works, or is replaced or removed. Agenthix Cloud *not available yet* notifies nobody: it never
 *   worked, so nothing broke.
 * - `provider_changed`: every write, announced to every organisation admin, so a change one admin makes is seen by
 *   the others.
 */
import { prisma } from 'wasp/server'
import { providerStateWorks, providerTypesOf, type ProviderRecordAction } from '@agenthix/core'
import { PROVIDER_NOTIFICATION_TYPES as T } from '../notifications/notificationKinds'
import { syncPersistentNotifications, type PersistentNotice } from '../notifications/persistent'
import { nameList } from '../notifications/adminNotices'
import { notificationsChanged } from '../server/personEvents'
import { nextOfType, type DefaultSlot } from './impact'
import { providerStore, type ProviderRow } from './store'
import { TYPE_WORDS } from './components/providerWords'

export const PROVIDERS_PAGE_URL = '/admin/providers'
export const providerLineUrl = (id: string) => `${PROVIDERS_PAGE_URL}?provider=${encodeURIComponent(id)}`

const STATE_TITLE: Partial<Record<ProviderRow['state'], (name: string) => string>> = {
  key_refused: name => `${name} refused its key`,
  out_of_credit: name => `${name} is out of credit`,
  unreachable: name => `${name} is not answering`,
  disconnected: name => `${name} is disconnected`,
}

const SLOT_WORDS: Record<DefaultSlot, string> = {
  conversation: 'the default model', stt: 'the default speech to text', tts: 'the default text to speech',
}

const sentence = (s: string) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s)

/** The notice for a provider that is not working, or null for one that needs none. */
export async function notWorkingNotice(p: ProviderRow, all: ProviderRow[]): Promise<PersistentNotice | null> {
  const title = STATE_TITLE[p.state]
  if (!title) return null
  const uses = await providerStore().usesOf(p.id)
  const others = all.filter(o => o.id !== p.id)
  const depends = [...uses.defaults.map(s => SLOT_WORDS[s]), ...(uses.agents.length ? [`${nameList(uses.agents.map(a => a.name))}'s own choices`] : [])]
  const moved = providerTypesOf(p.vendor).map(t => {
    const next = nextOfType(others, t)
    return next ? `${TYPE_WORDS[t]}: new work moved to ${next.name}.` : `${TYPE_WORDS[t]}: nothing else provides it, so it is down.`
  })
  const body = [
    p.stateDetail ? `${p.name} says: ${p.stateDetail}` : null,
    depends.length ? `${sentence(nameList(depends, 4))} ${depends.length === 1 ? 'uses' : 'use'} it.` : null,
    ...moved,
  ].filter(Boolean).join(' ')
  return { type: T.notWorking, subjectKey: p.id, title: title(p.name), body, actionLabel: 'Open', actionUrl: providerLineUrl(p.id), dismissible: false }
}

/** Makes the open `provider_not_working` notices match every provider's state now. */
export async function syncProviderNotices(): Promise<void> {
  const store = providerStore()
  const [all, admins] = await Promise.all([store.list(), store.orgAdmins()])
  const notices: PersistentNotice[] = []
  for (const p of all) {
    if (providerStateWorks(p.state)) continue
    const n = await notWorkingNotice(p, all)
    if (n) notices.push(n)
  }
  await syncPersistentNotifications(T.notWorking, notices, admins.map(a => a.id))
}

export type ProviderChange = {
  action: ProviderRecordAction
  /** Who made it, in words: a person's name, "HQ's machine" or "Agenthix Cloud". */
  by: string
  byUserId: string | null
  provider: Pick<ProviderRow, 'id' | 'name'>
  lines: string[]
}

const DID: Partial<Record<ProviderRecordAction, string>> = {
  added: 'added', key_replaced: "replaced the key of", renamed: 'renamed', removed: 'removed', revoked: 'revoked',
}

export function changeNotice(c: ProviderChange): { title: string; body: string; actionUrl: string } {
  const did = DID[c.action] ?? 'changed'
  const what = c.action === 'renamed' ? `a provider to ${c.provider.name}` : c.provider.name
  return {
    title: `${c.by} ${did} ${what}`,
    body: c.lines.join(' ') || 'Recorded on the Providers page.',
    actionUrl: c.action === 'removed' || c.action === 'revoked' ? PROVIDERS_PAGE_URL : providerLineUrl(c.provider.id),
  }
}

/** Every organisation admin is told of every write, the one who made it included. */
export async function announceProviderChange(c: ProviderChange): Promise<void> {
  const admins = await providerStore().orgAdmins()
  if (admins.length === 0) return
  const notice = changeNotice(c)
  await prisma.notification.createMany({
    data: admins.map(a => ({ userId: a.id, type: T.changed, ...notice, actionLabel: 'Open', ...(a.id === c.byUserId ? { status: 'read' } : {}) })),
  })
  notificationsChanged(admins.map(a => a.id))
}
