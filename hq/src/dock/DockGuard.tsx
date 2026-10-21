import { useCallback, useEffect, useRef } from 'react'
import { NavigationType, useBlocker, type BlockerFunction, type Location } from 'react-router'
import { useDock } from './DockContext'
import { threadAddressOf } from './dockAddress'

/**
 * Stops a move to a conversation's own address before the canvas leaves (spec §3) — a row in a list, or a box
 * that has just started one: the conversation opens in the dock and the canvas stays as it is, its scroll and
 * filters with it.
 *
 * Only a data router can block a navigation, so the shell draws this only when told it is under one (Wasp's
 * router is); elsewhere `useOpenConversation` reads the address after the canvas has moved.
 */
export function DockGuard() {
  const dock = useDock()
  const action = useRef<NavigationType>(NavigationType.Push)

  const shouldBlock = useCallback<BlockerFunction>(({ nextLocation, historyAction }) => {
    if (!dock || historyAction === NavigationType.Pop || !threadAddressOf(nextLocation.pathname)) return false
    action.current = historyAction
    return true
  }, [dock])
  const blocker = useBlocker(shouldBlock)

  const blockedAt = blocker.state === 'blocked' ? blocker.location : null
  // Each stopped navigation is settled once: the blocker reads as blocked until the router's state catches up.
  const settled = useRef<Location | null>(null)
  const latest = useRef(dock)
  latest.current = dock
  useEffect(() => {
    const current = latest.current
    if (!current || blocker.state !== 'blocked' || !blockedAt || settled.current === blockedAt) return
    settled.current = blockedAt
    const thread = threadAddressOf(blockedAt.pathname)
    blocker.reset()
    if (thread) current.openConversation(thread.conversationId, thread.basePath, { replace: action.current === NavigationType.Replace })
    // The blocker object changes on every render; its state and location are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state, blockedAt])

  return null
}
