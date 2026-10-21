import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useQuery, getConversation, getConversationMessages, sendConversationMessage, stopConversationTurn,
  sendWaitingConversationMessageNow, cancelWaitingConversationMessage, switchConversationAccess,
  getConversationActivity, answerConversationApproval, cancelConversationOperation,
} from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import {
  CONVERSATION_SOCKET,
  CONVERSATION_VOICE_SOCKET,
  type ConversationDeltaEvent,
  type ConversationMessageEvent,
  type ConversationMessageView,
  type ConversationOperationEvent,
  type ConversationOperationLinesEvent,
  type ConversationReplayEvent,
  type ConversationStepsEvent,
  type ConversationTurnEvent,
} from '../../shared/conversations/protocol'
import {
  actionErrorText, applyDelta, applyReplay, applySteps, clientIdFor, isReplyOf, mergeMessages, oldestSeq, stepsAfterEnd,
  streamAfterMessage, threadMessages, waitingOf, type LiveSteps, type StreamState,
} from './threadState'
import { applyLines, type LiveLines } from './activityState'

/** The socket as these events use it: the app's typed socket does not list the conversation room's events. */
type LooseSocket = {
  on: (event: string, handler: (...args: never[]) => void) => void
  off: (event: string, handler: (...args: never[]) => void) => void
  emit: (event: string, ...args: unknown[]) => void
}

/**
 * One conversation as the screen holds it: the record a page at a time, the room's live events merged in, the
 * reply being written, and the actions on it. Mount it keyed by the conversation's id.
 */
export function useConversationThread(conversationId: string) {
  const { socket } = useSocket()
  const { data: view, error: viewError, refetch: refetchView } = useQuery(getConversation, { conversationId })
  const [all, setAll] = useState<ConversationMessageView[]>([])
  const [loaded, setLoaded] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [stream, setStream] = useState<StreamState | null>(null)
  const [liveSteps, setLiveSteps] = useState<LiveSteps | null>(null)
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null)
  // When the running turn began on this screen's clock, for its pill before it has taken a step.
  const [turnSince, setTurnSince] = useState<{ turnId: string; at: number } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [answering, setAnswering] = useState(false)
  const [liveLines, setLiveLines] = useState<LiveLines>({})
  const { data: activity, refetch: refetchActivityQuery } = useQuery(getConversationActivity, { conversationId })
  const attempt = useRef<{ text: string; id: string } | null>(null)
  const answerAttempt = useRef<{ text: string; id: string } | null>(null)
  const rejoining = useRef(false)
  // The stream is read by the socket's handlers, which must not wait for a render to see what came before.
  const streamRef = useRef<StreamState | null>(null)
  const changeStream = useCallback((fn: (held: StreamState | null) => StreamState | null) => {
    streamRef.current = fn(streamRef.current)
    setStream(streamRef.current)
  }, [])

  const refetchActivity = useCallback(() => { void refetchActivityQuery?.() }, [refetchActivityQuery])

  const loadLatest = useCallback(async (first: boolean) => {
    const page = await getConversationMessages({ conversationId })
    setAll((held) => mergeMessages(held, page.messages))
    if (first) {
      setHasMore(page.hasMore)
      setLoaded(true)
    }
  }, [conversationId])

  useEffect(() => {
    loadLatest(true).catch((err) => setActionError(actionErrorText(err, 'The messages could not be loaded.')))
  }, [loadLatest])

  // The view says what is waiting and which reply is running; the room's events keep both current after that.
  useEffect(() => {
    if (!view) return
    setAll((held) => mergeMessages(held, view.waiting))
    setActiveTurnId(view.activeTurnId)
  }, [view])

  useEffect(() => {
    if (activeTurnId) setTurnSince((held) => (held?.turnId === activeTurnId ? held : { turnId: activeTurnId, at: Date.now() }))
  }, [activeTurnId])

  useEffect(() => {
    const s = socket as unknown as LooseSocket
    const join = () => s.emit(CONVERSATION_SOCKET.subscribe, conversationId)
    const mine = (e: { conversationId: string }) => e.conversationId === conversationId

    const onMessage = (e: ConversationMessageEvent) => {
      if (!mine(e)) return
      setAll((held) => mergeMessages(held, [e.message]))
      changeStream((st) => streamAfterMessage(st, e.message))
      // The reply is in the record with its steps: the live ones go.
      if (e.message.turnId && (e.message.kind === 'TEXT' || e.message.kind === 'FAILED') && e.message.role === 'AGENT') {
        const turnId = e.message.turnId
        setLiveSteps((held) => stepsAfterEnd(held, turnId))
      }
    }
    const onDelta = (e: ConversationDeltaEvent) => {
      if (!mine(e)) return
      setActiveTurnId((t) => t ?? e.turnId)
      const next = applyDelta(streamRef.current, e)
      changeStream(() => next.stream)
      // Text is missing before this: joining again returns what has been written so far.
      if (next.gap && !rejoining.current) { rejoining.current = true; join() }
    }
    const onReplay = (e: ConversationReplayEvent) => {
      if (!mine(e)) return
      rejoining.current = false
      changeStream((st) => applyReplay(st, e))
      setActiveTurnId((t) => t ?? e.turnId)
      const steps = e.steps
      if (steps) setLiveSteps((held) => applySteps(held, { turnId: e.turnId, ...steps }, Date.now()))
    }
    const onSteps = (e: ConversationStepsEvent) => {
      if (!mine(e)) return
      setActiveTurnId((t) => t ?? e.turnId)
      setLiveSteps((held) => applySteps(held, e, Date.now()))
    }
    const onTurn = (e: ConversationTurnEvent) => {
      if (!mine(e)) return
      if (e.state === 'QUEUED' || e.state === 'RUNNING') {
        setActiveTurnId(e.turnId)
        return
      }
      setActiveTurnId((t) => (t === e.turnId ? null : t))
      setLiveSteps((held) => stepsAfterEnd(held, e.turnId))
      // A reply that ended without being committed (stopped, failed) leaves nothing half-drawn.
      changeStream((st) => (st?.turnId === e.turnId && e.state !== 'COMPLETED' ? null : st))
      void refetchView()
    }
    const onOperation = (e: ConversationOperationEvent) => {
      if (!mine(e)) return
      refetchActivity()
    }
    const onLines = (e: ConversationOperationLinesEvent) => {
      if (!mine(e)) return
      setLiveLines((held) => applyLines(held, e))
    }
    // Who holds voice is part of the view: the box greys, or frees, the voice button.
    const onVoiceState = (e: { conversationId: string }) => {
      if (mine(e)) void refetchView()
    }
    const onReconnect = () => {
      join()
      refetchActivity()
      loadLatest(false).catch(() => undefined)
      void refetchView()
    }

    s.on(CONVERSATION_SOCKET.message, onMessage as never)
    s.on(CONVERSATION_SOCKET.messageUpdated, onMessage as never)
    s.on(CONVERSATION_SOCKET.delta, onDelta as never)
    s.on(CONVERSATION_SOCKET.replay, onReplay as never)
    s.on(CONVERSATION_SOCKET.steps, onSteps as never)
    s.on(CONVERSATION_SOCKET.turn, onTurn as never)
    s.on(CONVERSATION_SOCKET.operation, onOperation as never)
    s.on(CONVERSATION_SOCKET.operationLines, onLines as never)
    s.on(CONVERSATION_VOICE_SOCKET.state, onVoiceState as never)
    s.on('connect', onReconnect as never)
    join()
    return () => {
      s.off(CONVERSATION_SOCKET.message, onMessage as never)
      s.off(CONVERSATION_SOCKET.messageUpdated, onMessage as never)
      s.off(CONVERSATION_SOCKET.delta, onDelta as never)
      s.off(CONVERSATION_SOCKET.replay, onReplay as never)
      s.off(CONVERSATION_SOCKET.steps, onSteps as never)
      s.off(CONVERSATION_SOCKET.turn, onTurn as never)
      s.off(CONVERSATION_SOCKET.operation, onOperation as never)
      s.off(CONVERSATION_SOCKET.operationLines, onLines as never)
      s.off(CONVERSATION_VOICE_SOCKET.state, onVoiceState as never)
      s.off('connect', onReconnect as never)
      s.emit(CONVERSATION_SOCKET.unsubscribe, conversationId)
    }
  }, [socket, conversationId, loadLatest, refetchView, refetchActivity, changeStream])

  const loadOlder = useCallback(async () => {
    const before = oldestSeq(all)
    if (loadingOlder || !hasMore || before === undefined) return
    setLoadingOlder(true)
    try {
      const page = await getConversationMessages({ conversationId, beforeSeq: before })
      setAll((held) => mergeMessages(held, page.messages))
      setHasMore(page.hasMore)
    } catch (err) {
      setActionError(actionErrorText(err, 'Earlier messages could not be loaded.'))
    } finally {
      setLoadingOlder(false)
    }
  }, [all, conversationId, hasMore, loadingOlder])

  /** Runs an action of the person's and refreshes what it changed; its refusal is shown, in the server's words. */
  const act = useCallback(async (run: () => Promise<unknown>): Promise<boolean> => {
    setActionError(null)
    try {
      await run()
      await Promise.all([loadLatest(false), refetchView()])
      return true
    } catch (err) {
      setActionError(actionErrorText(err))
      return false
    }
  }, [loadLatest, refetchView])

  const send = useCallback(async (text: string): Promise<boolean> => {
    attempt.current = clientIdFor(attempt.current, text)
    const { id } = attempt.current
    setSending(true)
    const ok = await act(() => sendConversationMessage({ conversationId, clientMessageId: id, text }))
    setSending(false)
    if (ok) attempt.current = null
    return ok
  }, [act, conversationId])

  const answerApproval = useCallback(async (operationId: string, answer: 'approve' | 'decline', note?: string): Promise<boolean> => {
    answerAttempt.current = clientIdFor(answerAttempt.current, `${operationId}:${answer}:${note ?? ''}`)
    const { id } = answerAttempt.current
    setAnswering(true)
    const ok = await act(() => answerConversationApproval({ conversationId, operationId, answer, note, clientMessageId: id }))
    setAnswering(false)
    if (ok) answerAttempt.current = null
    refetchActivity()
    return ok
  }, [act, conversationId, refetchActivity])

  const stopOperation = useCallback(async (operationId: string): Promise<boolean> => {
    setAnswering(true)
    const ok = await act(() => cancelConversationOperation({ conversationId, operationId }))
    setAnswering(false)
    refetchActivity()
    return ok
  }, [act, conversationId, refetchActivity])

  return {
    view,
    activityRows: activity?.operations ?? [],
    liveLines,
    answering,
    answerApproval,
    stopOperation,
    viewError,
    loaded,
    messages: threadMessages(all),
    waiting: waitingOf(all),
    hasMore,
    loadingOlder,
    loadOlder,
    // A reply already committed to the record is not drawn twice; a line the turn wrote before its words does not hide them.
    stream: stream && !all.some((m) => isReplyOf(m, stream.turnId)) ? stream : null,
    running: activeTurnId !== null,
    turnId: activeTurnId,
    turnSince: turnSince && turnSince.turnId === activeTurnId ? turnSince.at : null,
    // The running reply's steps, once it has taken one: its pill, in place of the typing indicator.
    steps: liveSteps && liveSteps.turnId === activeTurnId ? liveSteps : null,
    actionError,
    clearError: () => setActionError(null),
    sending,
    send,
    stop: () => act(() => stopConversationTurn({ conversationId })),
    sendNow: (messageId: string) => act(() => sendWaitingConversationMessageNow({ conversationId, messageId })),
    cancelWaiting: (messageId: string) => act(() => cancelWaitingConversationMessage({ conversationId, messageId })),
    switchAccess: () => act(() => switchConversationAccess({ conversationId })),
  }
}
