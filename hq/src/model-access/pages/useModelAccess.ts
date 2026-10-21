import { useQuery, getModelCredentialStatus } from 'wasp/client/operations'
import { CREDENTIAL_PROVIDERS, PROVIDER_LABELS, type CredentialProvider } from '../../shared/modelProviders'
import type { ModelAccessOwnerType } from './modelAccessParts'

export type Owner = { ownerType: ModelAccessOwnerType; ownerId: string }
export type AccessId = 'subscription' | CredentialProvider

/** What each way of adding model access gives access to (the line the menu and the set list both show). */
export const ACCESS_LINE: Record<AccessId, string> = {
  subscription: 'Claude models, on your Claude account',
  anthropic: 'Claude models',
  openrouter: 'Many models, free ones included',
  openai: 'GPT models',
  google: 'Gemini models',
  openai_compatible: 'Any OpenAI-compatible server',
}

/** The menu's order: the subscription, the Anthropic key, then the providers reached through OpenCode. */
export const ACCESS_ORDER: AccessId[] = ['subscription', 'anthropic', 'openrouter', 'openai', 'google', 'openai_compatible']

const MENU_LABEL: Record<AccessId, string> = {
  subscription: 'Claude subscription',
  anthropic: 'Anthropic API key',
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  google: 'Google Gemini',
  openai_compatible: 'Your own endpoint',
}
export const menuLabel = (id: AccessId) => MENU_LABEL[id]

export function setLabel(id: AccessId): string {
  return id === 'subscription' ? 'Claude subscription' : id === 'openai_compatible' ? 'Own endpoint' : `${id === 'google' ? 'Google Gemini' : PROVIDER_LABELS[id]} key`
}

const whose = (type: ModelAccessOwnerType) => (type === 'user' ? 'yours' : type === 'org' ? "the organisation's" : "the project's")

export type SetAccess = {
  id: AccessId
  owner: Owner
  label: string
  whose: string
  line: string
  /** A stored subscription that is not in use (more than one person in the organisation). */
  idle: boolean
}

/**
 * What model access is set: API keys at `keyOwner` and, when offered, a Claude
 * subscription at `subscriptionOwner`. The queries always run in the same order.
 */
export function useModelAccess(keyOwner: Owner, subscriptionOwner?: Owner) {
  const subOwner = subscriptionOwner ?? keyOwner
  const sub = useQuery(getModelCredentialStatus, { ...subOwner, kind: 'SUBSCRIPTION', provider: 'anthropic' })
  const keys = CREDENTIAL_PROVIDERS.map(provider => ({ provider, q: useQuery(getModelCredentialStatus, { ...keyOwner, kind: 'API_KEY', provider }) }))
  const all = [{ id: 'subscription' as AccessId, q: sub }, ...keys.map(k => ({ id: k.provider as AccessId, q: k.q }))]
  const loaded = all.every(a => (a.id === 'subscription' && !subscriptionOwner) || a.q.data !== undefined)
  const set: SetAccess[] = ACCESS_ORDER.flatMap(id => {
    const q = all.find(a => a.id === id)!.q
    if (id === 'subscription' && !subscriptionOwner) return []
    if (!q.data?.present) return []
    const owner = id === 'subscription' ? subOwner : keyOwner
    const line = id === 'subscription' && owner.ownerType === 'user' ? `${ACCESS_LINE[id]} · yours, for your own runs` : ACCESS_LINE[id]
    return [{ id, owner, label: setLabel(id), whose: whose(owner.ownerType), line, idle: id === 'subscription' && q.data.usable === false }]
  })
  const refetch = () => { for (const a of all) void (a.q as { refetch?: () => unknown }).refetch?.() }
  return { loaded, set, refetch }
}
