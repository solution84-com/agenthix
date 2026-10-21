import { useCallback, useEffect, useState } from 'react'
import { summariseConversationNow } from 'wasp/client/operations'
import { useSocket } from 'wasp/client/webSocket'
import {
  CONVERSATION_SOCKET, type ConversationMessageEvent, type ConversationSummariseEvent,
} from '../../shared/conversations/protocol'
import { actionErrorText } from './threadState'
import { COULD_NOT_SUMMARISE, IDLE, RUNNING, summariseOnEvent, summariseOnMessage, type SummariseView } from './summariseState'

type LooseSocket = {
  on: (event: string, handler: (...args: never[]) => void) => void
  off: (event: string, handler: (...args: never[]) => void) => void
}

/**
 * *Summarise now* for one conversation (summariseState.ts). It listens in the room useConversationThread joined;
 * a refusal before the compaction starts comes back from the request itself.
 */
export function useSummariseNow(conversationId: string) {
  const { socket } = useSocket()
  const [view, setView] = useState<SummariseView>(IDLE)

  useEffect(() => {
    const s = socket as unknown as LooseSocket
    const onEvent = (e: ConversationSummariseEvent) => {
      if (e.conversationId === conversationId) setView((held) => summariseOnEvent(held, e))
    }
    const onMessage = (e: ConversationMessageEvent) => {
      if (e.conversationId === conversationId) setView((held) => summariseOnMessage(held, e.message))
    }
    s.on(CONVERSATION_SOCKET.summarise, onEvent as never)
    s.on(CONVERSATION_SOCKET.message, onMessage as never)
    return () => {
      s.off(CONVERSATION_SOCKET.summarise, onEvent as never)
      s.off(CONVERSATION_SOCKET.message, onMessage as never)
    }
  }, [socket, conversationId])

  const summarise = useCallback(async () => {
    setView(RUNNING)
    try {
      await summariseConversationNow({ conversationId })
    } catch (err) {
      setView({ state: 'failed', reason: actionErrorText(err, COULD_NOT_SUMMARISE) })
    }
  }, [conversationId])

  return {
    summarising: view.state === 'running',
    failure: view.state === 'failed' ? view.reason : null,
    summarise,
    dismiss: () => setView(IDLE),
  }
}
