import { useState, type Dispatch, type FormEvent, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import type { PanelChatViewActions } from './panelChatViewTypes'
import type { useLiveRun } from './useLiveRun'
import type { SessionDetail } from './types'

const errorText = (e: unknown, fallback: string) => (e as Error)?.message || fallback

/** What a person does in a conversation: send, stop, try a failure again, summarise, send or cancel a waiting message. */
export function useConversationActions({ sessionId, actions, live, refetch, inputText, setInputText, setOptimistic, setNotice, textareaRef, stickToBottomRef, sendDisabledReason }: {
  sessionId: string
  actions: PanelChatViewActions
  live: ReturnType<typeof useLiveRun>
  refetch: () => Promise<SessionDetail>
  inputText: string
  setInputText: Dispatch<SetStateAction<string>>
  setOptimistic: Dispatch<SetStateAction<string | null>>
  setNotice: Dispatch<SetStateAction<string | null>>
  textareaRef: RefObject<HTMLTextAreaElement | null>
  stickToBottomRef: MutableRefObject<boolean>
  sendDisabledReason?: string
}) {
  const [trying, setTrying] = useState(false)

  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    const text = inputText.trim()
    if (!text || sendDisabledReason) return
    setInputText('')
    setNotice(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    // While the agent works the server follows the person's setting: wait behind the reply, or stop it and send.
    const busy = live.isSending
    if (!busy) {
      setOptimistic(text)
      live.setPendingManifest(null) // a new message replaces a request nobody answered
      live.setIsSending(true)
      live.resetStreamed()
      stickToBottomRef.current = true
    }
    try {
      const run = await actions.triggerAgentRun({ sessionId, inputText: text })
      if (busy) await refetch()
      else live.track(run.id)
    } catch (err) {
      if (!busy) { live.setIsSending(false); setOptimistic(null) }
      setNotice(errorText(err, 'Failed to start run'))
    }
  }

  const handleStop = async () => {
    if (live.activeRunIdRef.current) await actions.cancelAgentRun({ runId: live.activeRunIdRef.current, sessionId }).catch(() => {})
  }

  const startRun = async (start: () => Promise<{ id: string }>, summarising = false) => {
    setNotice(null)
    try {
      live.track((await start()).id)
      if (summarising) live.setSummarising(true)
    } catch (err) {
      setNotice(errorText(err, 'That did not work.'))
    }
  }
  const handleTryAgain = async () => {
    setTrying(true)
    await startRun(() => actions.tryAgain({ sessionId }))
    setTrying(false)
  }
  const handleSummarise = () => startRun(() => actions.summariseConversation({ sessionId }), true)
  const afterWaiting = (act: (input: { sessionId: string; runId: string }) => Promise<unknown>) => async (runId: string) => {
    await act({ sessionId, runId })
    await refetch()
  }

  return { handleSend, handleStop, handleTryAgain, handleSummarise, afterWaiting, trying }
}
