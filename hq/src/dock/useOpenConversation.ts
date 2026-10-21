import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { UNSAFE_DataRouterContext, useLocation, useNavigate } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { useQuery, getLastWrittenConversation } from 'wasp/client/operations'
import { useDockWidth } from './useDockWidth'
import type { DockDraft, DockPosition, DockValue, OpenConversation } from './DockContext'
import { SPACE_REF, type PlaceRef } from './startPlace'
import {
  conversationParamOf, conversationsSectionOf, threadAddressOf, withConversation, type AddressParts,
} from './dockAddress'

/**
 * The open conversation, held by the shell (spec §1, §3). Links across hq drop the query, so the shell keeps the
 * conversation as its own state and writes `?c=` back onto every location, replacing it so Back is unaffected; an
 * address that names one (`?c=`, read on load and on Back) opens it.
 *
 * A conversation's own address (`/chat/t/<id>`) is read here too and replaced by the `?c=` form at once: on a
 * fresh load the canvas shows the conversation's place on its Conversations section; reached from inside hq the
 * canvas goes back to where the person was. (Under a data router, `DockGuard` stops it before the canvas leaves
 * at all.) This holds at every width (spec §12): the dock is the one place a conversation is shown.
 *
 * A new conversation being written (＋, *Talk about*) is the shell's state only, with no `?c=` until it is started.
 * What was open — the conversation and the dock's position — is remembered under it, the conversation still
 * mounted, so Cancel puts it back exactly; opening any conversation (sending, a list, Back) forgets it.
 * On any move of the canvas the dock gives way (spec §11, the board's narrower windows): expanded drops back to
 * docked; on a medium or narrow window, where the open dock covers the canvas, it is put away to its rail or pill.
 *
 * The dock is never empty (spec §2): with nothing open, it opens the conversation the person last wrote in, or, if
 * there is none, a new one in their space. On a medium or narrow window it does so put away, so the page shows first.
 */
export function useOpenConversation(): DockValue {
  const location = useLocation()
  const navigate = useNavigate()
  const width = useDockWidth()
  const widthRef = useRef(width)
  widthRef.current = width
  const [open, setOpen] = useState<OpenConversation | null>(() => {
    const id = conversationParamOf(location.search)
    return id ? { conversationId: id, basePath: null } : null
  })
  // Read by the location effect, which can run before a state update from the same event has rendered.
  const openRef = useRef(open)
  const [draft, setDraft] = useState<Draft | null>(null)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const [behind, setBehind] = useState<Behind | null>(null)
  const behindRef = useRef(behind)
  behindRef.current = behind
  const [position, setPosition] = useState<DockPosition>('docked')
  const positionRef = useRef(position)
  positionRef.current = position
  const canvas = useRef<AddressParts | null>(null)
  const locationRef = useRef(location)
  // Deleted or archived from the dock: never filled in again before the list of them is fresh.
  const passedOver = useRef(new Set<string>())
  locationRef.current = location

  const set = useCallback((next: OpenConversation | null) => {
    openRef.current = next
    setOpen(next)
    if (next) { setDraft(null); setBehind(null) }
  }, [])

  useLayoutEffect(() => {
    const here: AddressParts = { pathname: location.pathname, search: location.search, hash: location.hash }
    const thread = threadAddressOf(location.pathname)
    if (thread) {
      set({ conversationId: thread.conversationId, basePath: thread.basePath })
      navigate(withConversation(canvas.current ?? conversationsSectionOf(thread.basePath), thread.conversationId), { replace: true })
      return
    }
    const named = conversationParamOf(location.search)
    if (named) {
      if (named !== openRef.current?.conversationId) {
        set({ conversationId: named, basePath: null })
        setPosition((p) => (p === 'collapsed' ? 'docked' : p))
      }
      canvas.current = here
      return
    }
    const current = openRef.current
    if (current) {
      navigate(withConversation(here, current.conversationId), { replace: true, state: location.state })
      return
    }
    canvas.current = here
  }, [location, navigate, set])

  // The canvas's own address, without the open conversation: a change of it is going somewhere. A conversation's
  // own address is not: it is replaced at once by the page the person was on.
  const canvasKey = threadAddressOf(location.pathname)
    ? null
    : withConversation({ pathname: location.pathname, search: location.search, hash: location.hash }, null)
  const lastCanvasKey = useRef(canvasKey)
  useEffect(() => {
    const before = lastCanvasKey.current
    if (canvasKey === null || before === canvasKey) return
    lastCanvasKey.current = canvasKey
    if (before === null) return
    if (widthRef.current === 'wide') setPosition((p) => (p === 'expanded' ? 'docked' : p))
    else if (openRef.current || draftRef.current) setPosition('collapsed')
  }, [canvasKey])

  const openConversation = useCallback<DockValue['openConversation']>((conversationId, basePath, how) => {
    set({ conversationId, basePath })
    setPosition((p) => (p === 'collapsed' ? 'docked' : p))
    const at = locationRef.current
    navigate(withConversation(at, conversationId), { replace: how?.replace ?? false, state: at.state })
  }, [navigate, set])

  const startNew = useCallback((place: PlaceRef, agentId?: string | null) => {
    const at = locationRef.current
    if (!draftRef.current) setBehind({ open: openRef.current, position: positionRef.current })
    set(null)
    setDraft({ place, agentId: agentId ?? null })
    setPosition((p) => (p === 'collapsed' ? 'docked' : p))
    if (conversationParamOf(at.search)) navigate(withConversation(at, null), { state: at.state })
  }, [navigate, set])

  const cancelDraft = useCallback(() => {
    const before = behindRef.current
    // With nothing to go back to, the draft is put away instead: the dock is never empty.
    if (!before?.open) { setPosition('collapsed'); return }
    setDraft(null)
    setBehind(null)
    set(before.open)
    setPosition(before.position)
    const at = locationRef.current
    navigate(withConversation(at, before.open.conversationId), { replace: true, state: at.state })
  }, [navigate, set])

  const close = useCallback(() => {
    if (openRef.current) passedOver.current.add(openRef.current.conversationId)
    set(null)
    setDraft(null)
    setBehind(null)
    setPosition('docked')
    const at = locationRef.current
    navigate(withConversation(at, null), { replace: true, state: at.state })
  }, [navigate, set])

  useFill({ open, draft, location, widthRef, passedOver, openConversation, startNew, setPosition })

  const dockDraft = useMemo<DockDraft | null>(
    () => (draft ? { ...draft, behind: behind?.open ?? null, cancel: cancelDraft } : null),
    [draft, behind, cancelDraft],
  )

  return useMemo(
    () => ({ open, draft: dockDraft, width, openConversation, startNew, close, position, setPosition }),
    [open, dockDraft, width, openConversation, startNew, close, position],
  )
}

/** A new conversation being written: where, and with which agent if one was asked for. */
interface Draft {
  place: PlaceRef
  agentId: string | null
}

/** What was open when a new conversation was started, put back by Cancel. */
interface Behind {
  open: OpenConversation | null
  position: DockPosition
}

/** With nothing open and no address naming one, fills the dock (spec §2) once it is known what with. */
function useFill({ open, draft, location, widthRef, passedOver, openConversation, startNew, setPosition }: {
  open: OpenConversation | null
  draft: Draft | null
  location: AddressParts
  widthRef: { current: DockValue['width'] }
  passedOver: { current: Set<string> }
  openConversation: DockValue['openConversation']
  startNew: DockValue['startNew']
  setPosition: (position: DockPosition) => void
}) {
  const { data: user } = useAuth()
  const { data: last } = useQuery(getLastWrittenConversation, undefined, { enabled: !!user })
  const named = threadAddressOf(location.pathname) !== null || conversationParamOf(location.search) !== null
  const empty = !open && !draft && !named && last !== undefined
  // Read from the router itself, not a render: a navigation started since the last render must count too.
  const router = useContext(UNSAFE_DataRouterContext)?.router
  const [landed, setLanded] = useState(0)
  useEffect(() => {
    if (!empty) return
    // A page the person is on their way to would be replaced by filling now: the fill waits until it has landed
    // and been rendered, since the dock's moves start from the rendered address.
    if (router) {
      const at = router.state.location
      if (router.state.navigation.state !== 'idle') {
        return router.subscribe((state) => { if (state.navigation.state === 'idle') setLanded((n) => n + 1) })
      }
      if (at.pathname !== location.pathname || at.search !== location.search) return
    }
    if (last && !passedOver.current.has(last.conversationId)) openConversation(last.conversationId, null, { replace: true })
    else startNew(SPACE_REF)
    if (widthRef.current !== 'wide') setPosition('collapsed')
  }, [empty, last, passedOver, widthRef, openConversation, startNew, setPosition, router, landed, location.pathname, location.search])
}
