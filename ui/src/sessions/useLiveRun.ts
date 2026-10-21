/**
 * The run a conversation is showing live: its tool calls and thinking as they happen, the reply streaming in, the
 * seconds worked, a request for approval and a run's end. The record itself is read again when a run ends.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import type { JsonValue } from '@agenthix/core'
import { subscribeToSession, useSiteSocketListener } from './socketHooks'
import { useStreamingText } from './useStreamingText'
import type { LiveToolCall, PendingManifestData, TranscriptEntry } from './types'

export function useLiveRun<R extends { entries: TranscriptEntry[] }>({ socket, sessionId, refetch, onRunEnded }: {
  socket: Socket | null
  sessionId: string
  refetch: () => Promise<R>
  onRunEnded: (status: string, error: string | undefined, record: R) => void
}) {
  const [isSending, setIsSending] = useState(false)
  const [liveToolCalls, setLiveToolCalls] = useState<LiveToolCall[]>([])
  const [liveThought, setLiveThought] = useState('')
  const [thoughtAt, setThoughtAt] = useState<string | null>(null)
  const [pendingManifest, setPendingManifest] = useState<PendingManifestData | null>(null)
  const [runNotice, setRunNotice] = useState<string | null>(null)
  const [workingSecs, setWorkingSecs] = useState(0)
  const [summarising, setSummarising] = useState(false)
  const activeRunIdRef = useRef<string | null>(null)
  const { displayText: streamed, appendText, reset: resetStreamed } = useStreamingText()

  const clearLive = useCallback(() => {
    resetStreamed()
    setLiveToolCalls([])
    setLiveThought('')
    setThoughtAt(null)
    setRunNotice(null)
  }, [resetStreamed])

  useEffect(() => {
    setIsSending(false)
    setPendingManifest(null)
    setSummarising(false)
    activeRunIdRef.current = null
    clearLive()
  }, [sessionId, clearLive])

  useEffect(() => { subscribeToSession(socket, sessionId) }, [socket, sessionId])

  useEffect(() => {
    if (!isSending) { setWorkingSecs(0); return }
    const startedAt = Date.now()
    const timer = setInterval(() => setWorkingSecs(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [isSending])

  // On a fresh load a run may already be going: adopt the run id from the first event that arrives in the room.
  const accept = useCallback((runId: string): boolean => {
    if (activeRunIdRef.current === null) {
      activeRunIdRef.current = runId
      setIsSending(true)
      return true
    }
    return runId === activeRunIdRef.current
  }, [])

  useSiteSocketListener(socket, 'agentStreamDelta', useCallback((d: { runId: string; textDelta: string }) => {
    if (!accept(d.runId)) return
    setRunNotice(null)
    appendText(d.textDelta)
  }, [accept, appendText]))

  useSiteSocketListener(socket, 'agentThinking', useCallback((d: { runId: string; thinking: string }) => {
    if (!accept(d.runId)) return
    setLiveThought(prev => prev + d.thinking)
    setThoughtAt(prev => prev ?? new Date().toISOString())
  }, [accept]))

  useSiteSocketListener(socket, 'agentToolCall', useCallback((d: { runId: string; toolUseId: string; toolName: string; toolInput: JsonValue }) => {
    if (!accept(d.runId)) return
    setRunNotice(null)
    setLiveToolCalls(prev => [...prev, { toolUseId: d.toolUseId, toolName: d.toolName, toolInput: d.toolInput, status: 'running', at: new Date().toISOString() }])
  }, [accept]))

  useSiteSocketListener(socket, 'agentToolResult', useCallback((d: { runId: string; toolUseId: string; output: string }) => {
    if (!accept(d.runId)) return
    setLiveToolCalls(prev => prev.map(c => (c.toolUseId === d.toolUseId ? { ...c, output: d.output, status: 'done' } : c)))
  }, [accept]))

  useSiteSocketListener(socket, 'agentRunNotice', useCallback((d: { runId: string; notice: string }) => {
    if (accept(d.runId)) setRunNotice(d.notice)
  }, [accept]))

  useSiteSocketListener(socket, 'agentRunStatus', useCallback((d: { runId: string; status: string; error?: string }) => {
    // Any other run in the conversation is newer than the request on screen, which it replaced.
    setPendingManifest(prev => (prev && prev.runId !== d.runId ? null : prev))
    if (!accept(d.runId)) return
    if (d.status === 'COMPLETED' || d.status === 'FAILED' || d.status === 'CANCELLED') {
      setIsSending(false)
      setSummarising(false)
      activeRunIdRef.current = null
      void refetch().then(record => {
        clearLive()
        onRunEnded(d.status, d.error, record)
      })
    }
  }, [accept, refetch, clearLive, onRunEnded]))

  useSiteSocketListener(socket, 'manifestPendingApproval', useCallback((d: PendingManifestData) => {
    setIsSending(false)
    setPendingManifest(d)
    activeRunIdRef.current = null
    void refetch().then(record => {
      clearLive()
      onRunEnded('PENDING_APPROVAL', undefined, record)
    })
  }, [refetch, clearLive, onRunEnded]))

  useSiteSocketListener(socket, 'manifestRejected', useCallback(() => {
    setPendingManifest(null)
    setIsSending(false)
  }, []))

  /** A run this view started: events for it are the ones to show. */
  const track = useCallback((runId: string) => {
    activeRunIdRef.current = runId
    setIsSending(true)
  }, [])

  return {
    isSending, setIsSending, liveToolCalls, liveThought, thoughtAt, streamed, resetStreamed, runNotice, workingSecs,
    pendingManifest, setPendingManifest, summarising, setSummarising, activeRunIdRef, track, clearLive,
  }
}
