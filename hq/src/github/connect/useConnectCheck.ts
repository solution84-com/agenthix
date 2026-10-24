import { useEffect, useRef, useState } from 'react'
import { checkConnect } from 'wasp/client/operations'

export type ConnectKind = 'new' | 'existing'
type Target = { ownerType: 'user' | 'project'; ownerId: string; workspaceId?: string }
export type CheckAnswer = Awaited<ReturnType<typeof checkConnect>>

const WAIT_MS = 400

/**
 * Checks what connecting would meet (the account, the name, the reach) as the person types, before anything is
 * created. Only the newest answer is kept; nothing is asked for an empty name or address.
 */
export function useConnectCheck(target: Target, kind: ConnectKind, text: string, installationId: string | undefined) {
  const [answer, setAnswer] = useState<CheckAnswer | null>(null)
  const [checking, setChecking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const latest = useRef(0)
  const { ownerType, ownerId, workspaceId } = target

  useEffect(() => {
    const value = text.trim()
    const mine = ++latest.current
    setAnswer(null)
    setFailure(null)
    if (!value) { setChecking(false); return undefined }
    setChecking(true)
    const timer = setTimeout(() => {
      const ask = kind === 'new' ? { name: value } : { repoUrl: value }
      checkConnect({ target: { ownerType, ownerId, workspaceId }, kind, installationId, ...ask })
        .then((a) => { if (latest.current === mine) setAnswer(a) })
        .catch((e: unknown) => { if (latest.current === mine) setFailure(e instanceof Error ? e.message : 'The check failed.') })
        .finally(() => { if (latest.current === mine) setChecking(false) })
    }, WAIT_MS)
    return () => clearTimeout(timer)
  }, [ownerType, ownerId, workspaceId, kind, text, installationId])

  return { answer, checking, failure }
}
