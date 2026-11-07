import { useCallback } from 'react'
import type { ConversationMessageView, ConversationView } from '../../shared/conversations/protocol'
import { failedTurnOf, personWordsOfTurn } from './threadBlocks'

/**
 * What the thread does about a reply that failed or was stopped, and about a conversation that cannot be answered:
 * Try again sends the person's message again; the one access they may switch to rides on the failed reply's words;
 * with no failed reply to carry the problem, it is said in one line where the message box would be.
 */
export function useFailureControls(
  messages: ConversationMessageView[],
  view: Pick<ConversationView, 'accessProblem' | 'accessOffer' | 'canSpeak' | 'status'> | undefined,
  send: (text: string) => Promise<boolean>,
  switchAccess: () => Promise<unknown>,
) {
  const failedTurn = failedTurnOf(messages)
  const tryAgain = useCallback((turnId: string) => {
    const words = personWordsOfTurn(messages, turnId)
    if (words) void send(words)
  }, [messages, send])
  const writable = !!view && view.canSpeak && view.status !== 'CLOSED'
  return {
    onTryAgain: writable ? tryAgain : undefined,
    offer: failedTurn !== null && view?.accessProblem && view.accessOffer
      ? { label: view.accessOffer.label, onSwitch: () => void switchAccess() }
      : null,
    accessLine: writable && !!view?.accessProblem && failedTurn === null,
  }
}
