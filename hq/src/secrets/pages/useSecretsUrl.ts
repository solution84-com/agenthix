import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

export type SecretsTab = 'secrets' | 'variables'

/** Which tab the section shows, kept in the address (`&stab=variables`) so a link opens it. */
export function useSecretsUrl() {
  const [params, setParams] = useSearchParams()
  const tab: SecretsTab = params.get('stab') === 'variables' ? 'variables' : 'secrets'
  const setTab = useCallback((next: SecretsTab) => setParams((prev) => {
    const q = new URLSearchParams(prev)
    if (next === 'secrets') q.delete('stab'); else q.set('stab', next)
    return q
  }), [setParams])
  return { tab, setTab }
}
