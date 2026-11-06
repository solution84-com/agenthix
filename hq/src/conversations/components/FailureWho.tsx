import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { getUserSettings, useQuery } from 'wasp/client/operations'
import { ADMIN_TOLD, failureWords } from './failureWords'

/** A failure's reason as the reader needs it: what happened, and, where an administrator fixes it, what to do about it. */
export function useFailureText(reason: string): { what: string; who: ReactNode | null } {
  const { data: me } = useQuery(getUserSettings)
  const words = failureWords(reason)
  const isAdmin = me?.role === 'ADMIN'
  const who = !words.adminFixes ? null
    : isAdmin
      ? words.providers
        ? <Link to="/admin/providers" className="font-medium text-accent hover:text-accent-hover">Open Providers</Link>
        : 'You can fix this as an administrator.'
      : ADMIN_TOLD
  return { what: words.what || reason, who }
}
