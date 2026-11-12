import { useRef, useState } from 'react'
import { DISABLED, FOCUS_RING } from '@agenthix/ui/primitives'
import { useNavigate } from 'react-router'
import { useAction, startConversation } from 'wasp/client/operations'
import { actionErrorText, clientIdFor } from '../../conversations/hooks/threadState'
import { threadPath } from '../../conversations/threadPaths'
import { CHAT_PATH } from '../../chat/chatComposer'
import { ShowAttention } from '@agenthix/ui/attention'
import { useDemoPrompts } from '../../demo/useDemo'

export const FIRST_SUGGESTIONS = ['What can you do?', 'Set up my first project', 'Invite my team'] as const

/**
 * What a newcomer might say first (getting-in spec, The first admin): each starts a new conversation in the
 * person's own space with the built-in agent, and opens it. In the demo they are what the agent's scripts answer.
 */
export function FirstSuggestions({ agent }: { agent: { id: string; name: string; handle?: string } | null }) {
  const suggestions = useDemoPrompts(agent?.handle) ?? FIRST_SUGGESTIONS
  const navigate = useNavigate()
  const start = useAction(startConversation)
  const attempt = useRef<{ text: string; id: string } | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [error, setError] = useState('')
  if (!agent) return null

  async function send(text: string) {
    if (!agent) return
    setSending(text)
    setError('')
    attempt.current = clientIdFor(attempt.current, text)
    try {
      const result = await start({ home: 'PERSON', agentId: agent.id, clientMessageId: attempt.current.id, text })
      attempt.current = null
      setSending(null)
      navigate(threadPath(CHAT_PATH, result.conversationId))
    } catch (err) {
      setError(actionErrorText(err, 'Could not start the conversation'))
      setSending(null)
    }
  }

  return (
    <section aria-label={`Ask ${agent.name}`} data-testid="first-suggestions">
      <div className="flex flex-wrap justify-center gap-2">
        {suggestions.map(text => (
          <button
            key={text}
            type="button"
            disabled={sending !== null}
            onClick={() => void send(text)}
            className={`rounded-full border border-border bg-button-secondary px-3.5 py-1.5 text-small text-text-secondary transition-colors not-disabled:hover:bg-surface-hover not-disabled:hover:text-text-primary not-disabled:active:bg-surface-pressed ${FOCUS_RING} ${DISABLED}`}
          >
            {text}
          </button>
        ))}
      </div>
      <ShowAttention kind="alert" text={error} title="The conversation was not started" onClose={() => setError('')} />
    </section>
  )
}
