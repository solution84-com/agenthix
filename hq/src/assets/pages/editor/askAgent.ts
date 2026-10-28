import { useRef, useState } from 'react'
import { useAction, useQuery, startConversation, getConversationAgentChoices } from 'wasp/client/operations'
import type { ConversationAgentView } from '../../../shared/conversations/protocol'
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

/** Where *Ask an agent* opens its conversation: the person's own space, where they may talk to any agent. */
export const ASK_WHERE = 'Your space'

/** The agent that will answer: the one picked if it is still a choice, else the first, which is the person's main agent. */
export function answeringAgent(choices: readonly ConversationAgentView[] | undefined, picked: string | null): ConversationAgentView | null {
  return choices?.find(a => a.id === picked) ?? choices?.[0] ?? null
}

/**
 * *Ask an agent to edit* and *Ask an agent to write it* (finding 14): names the agent that will answer before anything
 * is sent (the person's main agent unless they pick another of those they may talk to in Your space), then starts a
 * conversation there with that agent and opens it in the dock. hq checks the agent is one they may talk to.
 */
export function useAskAgent() {
  const start = useAction(startConversation)
  const { data: choices, error: choicesError } = useQuery(getConversationAgentChoices, { home: 'PERSON' })
  const [picked, setPicked] = useState<string | null>(null)
  const agent = answeringAgent(choices, picked)
  const dock = useDock()
  const attempt = useRef<{ text: string; id: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function ask(text: string): Promise<boolean> {
    if (!agent) return false
    setSending(true)
    setError('')
    attempt.current = clientIdFor(attempt.current, text)
    try {
      const result = await start({ home: 'PERSON', agentId: agent.id, clientMessageId: attempt.current.id, text, skill: { name: SKILL_CREATOR } })
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
  const unavailable = choicesError ? choicesError.message : choices && choices.length === 0 ? 'There is no agent to ask yet.' : null
  return { ask, sending, error, agent, choices: choices ?? [], pick: setPicked, unavailable }
}
