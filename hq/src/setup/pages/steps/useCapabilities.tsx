import { useEffect, useRef } from 'react'
import { useQuery, getSetupDefaults, getWebSearchKeyStatus } from 'wasp/client/operations'
import type { AiProviderSummary } from '@agenthix/core'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { KeyUnread } from '../../../capabilities/components/KeyUnread'
import { capabilityList } from '../../../capabilities/capabilityList'

/**
 * What agents can do, worked out for setup from the providers, the defaults chosen for the person and whether a web
 * search key is held. Read again whenever a provider is added or removed, or changes state.
 */
export function useCapabilities(providers: AiProviderSummary[]) {
  const defaultsQuery = useQuery(getSetupDefaults)
  const keyQuery = useQuery(getWebSearchKeyStatus)
  const { data, refetch } = defaultsQuery
  const refetchKey = keyQuery.refetch
  const seen = useRef<string | null>(null)
  const signature = providers.map(p => `${p.id}:${p.state}`).join(',')
  useEffect(() => {
    if (seen.current !== null && seen.current !== signature) { void refetch(); void refetchKey() }
    seen.current = signature
  }, [signature, refetch, refetchKey])
  const keyRead = useBackgroundRead(keyQuery, { what: 'Whether there is a search key' })
  // An unanswered key read is never "no key": the Web search line says it could not be read.
  const unread = keyRead.failedWithoutData ? { web_search: <KeyUnread retry={() => void refetchKey()} /> } : {}
  const defaults = data ?? { conversation: null, stt: null, tts: null }
  const capabilities = capabilityList({ providers, defaults, webSearchKey: keyQuery.data?.present ?? false })
  return { capabilities, unread, data, defaultsQuery, keyPresent: keyQuery.data?.present ?? false, refetchKey }
}
