import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useQuery, getConversation, getConversationMessages, sendConversationMessage, stopConversationTurn,
  sendWaitingConversationMessageNow, cancelWaitingConversationMessage, switchConversationAccess,
  getConversationActivity, answerConversationApproval, cancelConversationOperation,
} from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import type { PickedSkill, SharedFile } from '@agenthix/core'
import {
  CONVERSATION_SOCKET,
  CONVERSATION_VOICE_SOCKET,
  type ConversationDeltaEvent,
  type ConversationMessageEvent,
  type ConversationMessageView,
  type ConversationOperationEvent,
  type ConversationSummariseEvent,
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
import { retryRead } from '@agenthix/ui/attention'
import { threadLine, useThreadNudges } from './useThreadNudges'

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
  const { data: view, error: viewError, dataUpdatedAt, refetch: refetchView } = useQuery(getConversation, { conversationId })
  const [all, setAll] = useState<ConversationMessageView[]>([])
  const [loaded, setLoaded] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [stream, setStream] = useState<StreamState | null>(null)
  const [liveSteps, setLiveSteps] = useState<LiveSteps | null>(null)
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null)
  // When the running turn began on this screen's clock, for its pill before it has taken a step.
  const [turnSince, setTurnSince] = useState<{ turnId: string; at: number } | null>(null)
  const nudges = useThreadNudges()
  // The thread's first page could not be read through the retries: said in place of the thread.
  const [loadError, setLoadError] = useState<unknown>(null)
  // Earlier messages could not be read through the retries: said at the top of the thread, until Try again.
  const [olderFailed, setOlderFailed] = useState(false)
  const [pressFailure, setPressFailure] = useState<string | null>(null)
  const [pressHeld, setPressHeld] = useState(false)
  // Why the message in the box was not sent: said in the box's own slot, the words kept in it.
  const [sendError, setSendError] = useState<string | null>(null)
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

  const loadFirst = useCallback(() => {
    setLoadError(null)
    retryRead(() => loadLatest(true)).catch((err: unknown) => setLoadError(err ?? new Error('The messages could not be read.')))
  }, [loadLatest])
  useEffect(loadFirst, [loadFirst])

  // A re-read after an action or a reconnect is a read the screen makes on its own: quiet, and never the action's failure.
  const reread = useCallback(() => {
    retryRead(() => loadLatest(false)).catch(() => undefined)
    void refetchView()
  }, [loadLatest, refetchView])

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
    // Once the room has the socket, the record is read again: a reply that ended before the join sent its end to
    // no one, and the first read may still show it running.
    const joined = (ok: unknown) => {
      if (ok === true) reread()
    }
    const join = () => s.emit(CONVERSATION_SOCKET.subscribe, conversationId, joined)
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
    // A compaction holds the conversation's lock under an id of its own, which a read can return as a running
    // reply; once it has ended no reply runs, until a turn event says one does.
    const onSummarise = (e: ConversationSummariseEvent) => {
      if (mine(e) && e.state !== 'started') setActiveTurnId(null)
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
      reread()
    }

    s.on(CONVERSATION_SOCKET.message, onMessage as never)
    s.on(CONVERSATION_SOCKET.messageUpdated, onMessage as never)
    s.on(CONVERSATION_SOCKET.delta, onDelta as never)
    s.on(CONVERSATION_SOCKET.replay, onReplay as never)
    s.on(CONVERSATION_SOCKET.steps, onSteps as never)
    s.on(CONVERSATION_SOCKET.turn, onTurn as never)
    s.on(CONVERSATION_SOCKET.summarise, onSummarise as never)
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
      s.off(CONVERSATION_SOCKET.summarise, onSummarise as never)
      s.off(CONVERSATION_SOCKET.operation, onOperation as never)
      s.off(CONVERSATION_SOCKET.operationLines, onLines as never)
      s.off(CONVERSATION_VOICE_SOCKET.state, onVoiceState as never)
      s.off('connect', onReconnect as never)
      s.emit(CONVERSATION_SOCKET.unsubscribe, conversationId)
    }
  }, [socket, conversationId, reread, refetchView, refetchActivity, changeStream])

  /**
   * Reads the page before the oldest. The scroll and the fill read it on their own: retried quietly, and a failure is
   * the line at the top (handler 8). Pressed, it is the person's press: read once, and a failure is the dialog
   * (handler 1), whose Try again presses it again.
   */
  const loadOlder = useCallback(async (pressed = false) => {
    const before = oldestSeq(all)
    if (loadingOlder || !hasMore || before === undefined) return
    setLoadingOlder(true)
    setOlderFailed(false)
    setPressFailure(null)
    try {
      const read = () => getConversationMessages({ conversationId, beforeSeq: before })
      const page = await (pressed ? read() : retryRead(read))
      setAll((held) => mergeMessages(held, page.messages))
      setHasMore(page.hasMore)
      setPressHeld(false)
    } catch (err) {
      if (pressed) {
        setPressFailure(actionErrorText(err))
        // The scroll and the fill do not read again until a press works: the dialog has said it.
        setPressHeld(true)
      } else setOlderFailed(true)
    } finally {
      setLoadingOlder(false)
    }
  }, [all, conversationId, hasMore, loadingOlder])

  const { push, clear } = nudges
  /**
   * Runs an action of the person's on the conversation; its refusal is a line after the thread's last message, in the
   * server's words, with Try again, and goes once the same action works. What it changed is read again quietly.
   */
  const act = useCallback(async (key: string, title: string, run: () => Promise<unknown>): Promise<boolean> => {
    try {
      await run()
    } catch (err) {
      push({ key, text: threadLine(title, actionErrorText(err)), retry: () => void act(key, title, run) })
      return false
    }
    clear(key)
    reread()
    return true
  }, [push, clear, reread])

  /** Posts a message of the person's, once per attempt however often it is tried; throws its refusal. */
  const post = useCallback(async (text: string, skill?: PickedSkill, shared: SharedFile[] = []): Promise<void> => {
    // The same words with another skill, or other files, are another message.
    const files = shared.map(f => f.name).join('\n')
    attempt.current = clientIdFor(attempt.current, `${skill ? `${skill.name}\n` : ''}${files ? `${files}\n` : ''}${text}`)
    const { id } = attempt.current
    setSending(true)
    try {
      await sendConversationMessage({
        conversationId, clientMessageId: id, text, ...(skill ? { skill } : {}), ...(shared.length > 0 ? { shared } : {}),
      })
      attempt.current = null
    } finally {
      setSending(false)
    }
  }, [conversationId])

  /** The message box's Send: refused, it is "Not sent" in the box, the words kept there. */
  const send = useCallback(async (text: string, skill?: PickedSkill, shared: SharedFile[] = []): Promise<boolean> => {
    setSendError(null)
    try {
      await post(text, skill, shared)
    } catch (err) {
      setSendError(actionErrorText(err))
      return false
    }
    // Sent: a re-read that fails now is quiet, never "Not sent", so the message is not sent twice.
    reread()
    return true
  }, [post, reread])

  const answerApproval = useCallback(async (operationId: string, answer: 'approve' | 'decline', note?: string): Promise<boolean> => {
    answerAttempt.current = clientIdFor(answerAttempt.current, `${operationId}:${answer}:${note ?? ''}`)
    const { id } = answerAttempt.current
    setAnswering(true)
    const ok = await act(`answer:${operationId}`, 'The request was not answered', () => answerConversationApproval({ conversationId, operationId, answer, note, clientMessageId: id }))
    setAnswering(false)
    if (ok) answerAttempt.current = null
    refetchActivity()
    return ok
  }, [act, conversationId, refetchActivity])

  const stopOperation = useCallback(async (operationId: string): Promise<boolean> => {
    setAnswering(true)
    const ok = await act(`stop:${operationId}`, 'The work was not stopped', () => cancelConversationOperation({ conversationId, operationId }))
    setAnswering(false)
    refetchActivity()
    return ok
  }, [act, conversationId, refetchActivity])

  return {
    view,
    activityRows: activity?.operations ?? [],
    activityLoaded: activity !== undefined,
    liveLines,
    answering,
    answerApproval,
    stopOperation,
    viewQuery: { data: view, error: viewError, dataUpdatedAt, refetch: refetchView },
    refetchView: () => { void refetchView() },
    loaded,
    loadError,
    retryLoad: loadFirst,
    olderFailed,
    olderPressFailure: pressFailure,
    clearOlderPressFailure: () => setPressFailure(null),
    olderHeld: pressHeld,
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
    nudges,
    sendError,
    sending,
    send,
    /** Sends a message of the person's again, from the thread (Try again on a failed reply): its failure is a line. */
    sendAgain: (text: string) => act('send-again', 'The message was not sent again', () => post(text)),
    stop: () => act('stop', 'The reply was not stopped', () => stopConversationTurn({ conversationId })),
    sendNow: (messageId: string) => act(`now:${messageId}`, 'The message was not sent now', () => sendWaitingConversationMessageNow({ conversationId, messageId })),
    cancelWaiting: (messageId: string) => act(`cancel:${messageId}`, 'The message was not taken back', () => cancelWaitingConversationMessage({ conversationId, messageId })),
    switchAccess: () => act('access', 'The access was not switched', () => switchConversationAccess({ conversationId })),
  }
}
