import { useState, type Dispatch, type FormEvent, type MutableRefObject, type RefObject, type SetStateAction } from 'react'
import { retryRead } from '../attention/retry'
import type { PanelChatViewActions } from './panelChatViewTypes'
import type { useLiveRun } from './useLiveRun'
import type { SessionDetail } from './types'

const errorText = (e: unknown, fallback: string) => (e as Error)?.message || fallback

/**
 * A conversation's own failure, said as a line after the thread's last message: not stored, gone after a reload or
 * when an action next works. `retry` is its Try again.
 */
export type ThreadLine = { words: string; retry?: () => void }

/**
 * What a person does in a conversation: send, stop, try a failure again, summarise, send or cancel a waiting message.
 * Only the action's own failure is said (the thread line, or "Not sent" for a message); the re-read after an action
 * that worked is a quiet retry, so a message that was accepted is never "Not sent".
 */
export function useConversationActions({ sessionId, actions, live, refetch, inputText, setInputText, setOptimistic, setLine, setNotSent, textareaRef, stickToBottomRef, sendDisabledReason }: {
  sessionId: string
  actions: PanelChatViewActions
  live: ReturnType<typeof useLiveRun>
  refetch: () => Promise<SessionDetail>
  inputText: string
  setInputText: Dispatch<SetStateAction<string>>
  setOptimistic: Dispatch<SetStateAction<string | null>>
  setLine: Dispatch<SetStateAction<ThreadLine | null>>
  setNotSent: Dispatch<SetStateAction<string | null>>
  textareaRef: RefObject<HTMLTextAreaElement | null>
  stickToBottomRef: MutableRefObject<boolean>
  sendDisabledReason?: string
}) {
  const [trying, setTrying] = useState(false)
  // A re-read after an action that worked: the next good read, or the next update, puts it right.
  const readAgain = () => { void retryRead(refetch).catch(() => {}) }

  const send = async (text: string) => {
    if (!text || sendDisabledReason) return
    setInputText('')
    setLine(null)
    setNotSent(null)
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
    let run: { id: string }
    try {
      run = await actions.triggerAgentRun({ sessionId, inputText: text })
    } catch (err) {
      if (!busy) { live.setIsSending(false); setOptimistic(null) }
      // The words go back in the box, unless the person has started typing something else meanwhile.
      setInputText(prev => (prev.trim() ? prev : text))
      setNotSent(errorText(err, 'HQ did not answer.'))
      return
    }
    if (busy) readAgain()
    else live.track(run.id)
  }
  const handleSend = async (e: FormEvent) => {
    e.preventDefault()
    await send(inputText.trim())
  }
  const sendAgain = () => send(inputText.trim())

  const handleStop = async () => {
    const runId = live.activeRunIdRef.current
    if (!runId) return
    try {
      await actions.cancelAgentRun({ runId, sessionId })
      setLine(null)
    } catch (err) {
      setLine({ words: `The reply could not be stopped: ${errorText(err, 'HQ did not answer.')}`, retry: () => void handleStop() })
    }
  }

  const startRun = async (start: () => Promise<{ id: string }>, again: () => void, summarising = false) => {
    setLine(null)
    try {
      live.track((await start()).id)
      if (summarising) live.setSummarising(true)
    } catch (err) {
      setLine({ words: errorText(err, 'That did not work.'), retry: again })
    }
  }
  const handleTryAgain = async () => {
    setTrying(true)
    await startRun(() => actions.tryAgain({ sessionId }), () => void handleTryAgain())
    setTrying(false)
  }
  const handleSummarise = (): Promise<void> => startRun(() => actions.summariseConversation({ sessionId }), () => void handleSummarise(), true)
  // The model chosen for the next reply; the box shows the choice, so only a failure is said.
  const changeModel = async (model: string) => {
    setLine(null)
    try {
      await actions.updateSession({ id: sessionId, model })
      readAgain()
    } catch (err) {
      setLine({ words: `The model was not changed: ${errorText(err, 'HQ did not answer.')}`, retry: () => void changeModel(model) })
    }
  }
  // A waiting message's Send now or Cancel.
  const afterWaiting = (act: (input: { sessionId: string; runId: string }) => Promise<unknown>) => {
    const go = async (runId: string) => {
      setLine(null)
      try {
        await act({ sessionId, runId })
      } catch (err) {
        setLine({ words: errorText(err, 'That did not work.'), retry: () => void go(runId) })
        return
      }
      readAgain()
    }
    return go
  }

  return { handleSend, sendAgain, handleStop, handleTryAgain, handleSummarise, afterWaiting, changeModel, trying }
}
