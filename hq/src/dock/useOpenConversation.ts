import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { UNSAFE_DataRouterContext, useLocation, useNavigate } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { useQuery, getLastWrittenConversation } from 'wasp/client/operations'
import { useDockWidth } from './useDockWidth'
import type { DockDraft, DockPosition, DockValue, OpenConversation, TaskTarget } from './DockContext'
import { SPACE_REF, type PlaceRef } from './startPlace'
import { viewerTargetOf, withViewer } from '../storage/pages/viewer/viewerAddress'
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
 * docked; on a medium or narrow window, where the open dock covers the canvas, it is minimised to its bar, or on a phone folded away.
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
  // Opening or closing the file viewer over the canvas is not going somewhere either: the chat stays beside the file.
  const canvasKey = threadAddressOf(location.pathname)
    ? null
    : withConversation({ pathname: location.pathname, search: withViewer(location.search, null), hash: location.hash }, null)
  const lastCanvasKey = useRef(canvasKey)
  // The dock's position when a file was opened in the viewer, put back when it closes (R2).
  const beforeFile = useRef<DockPosition | null>(null)
  useEffect(() => {
    const before = lastCanvasKey.current
    if (canvasKey === null || before === canvasKey) return
    lastCanvasKey.current = canvasKey
    if (before === null) return
    // Going somewhere from the viewer: the page gone to decides, not what was there before the file opened.
    beforeFile.current = null
    if (widthRef.current === 'wide') setPosition((p) => (p === 'expanded' ? 'docked' : p))
    else if (openRef.current || draftRef.current) setPosition('collapsed')
  }, [canvasKey])

  const fileOpen = useMemo(() => fileOpenAt(location.search), [location.search])
  useFileBeside(fileOpen, positionRef, beforeFile, setPosition)

  const openConversation = useCallback<DockValue['openConversation']>((conversationId, basePath, how) => {
    set({ conversationId, basePath })
    setPosition((p) => (p === 'collapsed' ? 'docked' : p))
    const at = locationRef.current
    navigate(withConversation(at, conversationId), { replace: how?.replace ?? false, state: at.state })
  }, [navigate, set])

  const startNew = useCallback((place: PlaceRef, agentId?: string | null, task?: TaskTarget | null) => {
    const at = locationRef.current
    // What the draft is drawn over: the conversation open now, or (asking again) the one an earlier draft covers.
    const over = openRef.current ?? (draftRef.current ? behindRef.current?.open ?? null : null)
    if (!draftRef.current) setBehind({ open: openRef.current, position: positionRef.current })
    set(null)
    setDraft((was) => ({ place, agentId: agentId ?? null, task: task ?? null, asked: (was?.asked ?? 0) + 1 }))
    // Over an open conversation the new one is its own dialog: a minimised panel stays minimised behind it, and
    // opens only when the new conversation starts. With nothing open, the draft fills the panel, which opens for it.
    // A phone's panel is the whole screen either way.
    if (!over || widthRef.current === 'narrow') setPosition((p) => (p === 'collapsed' ? 'docked' : p))
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
    () => ({ open, draft: dockDraft, width, openConversation, startNew, close, position, besideFile: fileOpen, setPosition }),
    [open, dockDraft, width, openConversation, startNew, close, position, fileOpen],
  )
}

/** Whether the address has a file open in the viewer over the canvas. */
export function fileOpenAt(search: string): boolean {
  return viewerTargetOf(search) !== null
}

/**
 * The chat beside an open file (the file viewer's rule 2; R2): opening a file drops a chat over the page to its docked
 * place beside it, and closing the file puts back the position the chat had before the file opened. Moving between
 * files changes nothing, so minimising the chat while reading holds from file to file.
 */
function useFileBeside(
  fileOpen: boolean,
  positionRef: { current: DockPosition },
  beforeFile: { current: DockPosition | null },
  setPosition: (position: DockPosition) => void,
) {
  const lastFileOpen = useRef(fileOpen)
  useEffect(() => {
    if (lastFileOpen.current === fileOpen) return
    lastFileOpen.current = fileOpen
    if (fileOpen) {
      beforeFile.current = positionRef.current
      if (positionRef.current === 'expanded') setPosition('docked')
      return
    }
    const before = beforeFile.current
    beforeFile.current = null
    if (before) setPosition(before)
  }, [fileOpen, positionRef, beforeFile, setPosition])
}

/** A new conversation being written: where, and with which agent if one was asked for. */
interface Draft {
  place: PlaceRef
  agentId: string | null
  task: TaskTarget | null
  /** Counts each ask, so asking again while the draft shows can bring the caret back to its box. */
  asked: number
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
