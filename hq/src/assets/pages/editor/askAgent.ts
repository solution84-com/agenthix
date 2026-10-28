import { useRef, useState } from 'react'
import { useAction, startConversation } from 'wasp/client/operations'
import { actionErrorText, clientIdFor } from '../../../conversations/hooks/threadState'
import { useDock } from '../../../dock/DockContext'

/** The built-in skill that tells an agent how to draft a skill; it stages for a run under this name. */
export const SKILL_CREATOR = 'platform-skill-creator'

/** The first message of *Ask an agent to edit*: names the skill, so the conversation has it attached, and what to change. */
export function editRequest(identity: string, where: string, ask: string): string {
  return [
    `Please change the skill ${identity} (in ${where}): ${ask.trim()}`,
    `Use the skill creator, and propose the change with propose_skill, naming ${identity} in edits. Don't write the skill into files yourself.`,
  ].join('\n\n')
}

/** *Ask an agent to edit* and *Ask an agent to write it*: starts a conversation with the person's usual agent and opens it in the dock. */
export function useAskAgent() {
  const start = useAction(startConversation)
  const dock = useDock()
  const attempt = useRef<{ text: string; id: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function ask(text: string): Promise<boolean> {
    setSending(true)
    setError('')
    attempt.current = clientIdFor(attempt.current, text)
    try {
      const result = await start({ home: 'PERSON', clientMessageId: attempt.current.id, text, skill: { name: SKILL_CREATOR } })
      attempt.current = null
      dock?.openConversation(result.conversationId, null)
      return true
    } catch (err) {
      setError(actionErrorText(err))
      return false
    } finally {
      setSending(false)
    }
  }
  return { ask, sending, error }
}
