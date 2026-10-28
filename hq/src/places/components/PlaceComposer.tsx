import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useAction, startConversation } from 'wasp/client/operations'
import { ChevronDown, Send } from 'lucide-react'
import { useMentionTarget } from '@agenthix/ui/sessions'
import { useMayWork, VIEWER_CANNOT_WORK } from '../../shared/hooks/useMayWork'
import type { Place } from '../placeTypes'
import { actionErrorText, clientIdFor } from '../../conversations/hooks/threadState'
import { threadPath } from '../../conversations/threadPaths'
import { StartSkillPicker } from '../../conversations/components/atPicker/SkillPicker'
import { SkillChip } from '../../conversations/components/atPicker/SkillChip'
import { useStartSkillPicker } from '../../conversations/components/atPicker/useStartSkillPicker'

/** The agent a new conversation starts with: the place's default when it may be talked to here, else the first. */
export function startingAgentId(place: Pick<Place, 'agents' | 'defaultAgentId'>): string {
  if (place.defaultAgentId && place.agents.some((a) => a.id === place.defaultAgentId)) return place.defaultAgentId
  return place.agents[0]?.id ?? ''
}

/** What the message box needs of a place. */
export type ComposerPlace = Pick<Place, 'basePath' | 'sessionLocation' | 'agents' | 'defaultAgentId' | 'composerPlaceholder' | 'noAgentsNotice'>

/**
 * A message box with the place's own agents to pick from — an agent's page has only that agent. Sending the first
 * message starts a new conversation with the picked agent, in the place's project or else in the person's own
 * space, and opens it. A project's Viewer talks to none of its agents (adr-0102), so they get a line saying so in
 * its place. `/` at the start of the message picks one of the agent's skills, sent beside the first message.
 */
export const PlaceComposer = forwardRef<HTMLTextAreaElement, { place: ComposerPlace; autoFocus?: boolean }>(function PlaceComposer({ place, autoFocus = false }, ref) {
  const navigate = useNavigate()
  const start = useAction(startConversation)
  const attempt = useRef<{ text: string; id: string } | null>(null)
  const mayWork = useMayWork(place.sessionLocation?.primaryOwnerId)
  const [text, setText] = useState('')
  // Mention in a Files tool puts a file's path into this box.
  useMentionTarget(useCallback((t: string) => setText(p => (p.trim() ? `${p.trimEnd()} ${t} ` : `${t} `)), []))
  const [agentId, setAgentId] = useState(() => startingAgentId(place))
  const picked = useRef(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const projectId = place.sessionLocation?.primaryOwnerId
  const { skills, box, textarea } = useStartSkillPicker({ enabled: Boolean(agentId) && mayWork, agentId, text, setText })
  useImperativeHandle(ref, () => box.current as HTMLTextAreaElement)

  // The place's agents and its default arrive after the first render, and can change while the screen is open.
  useEffect(() => {
    if (!picked.current || !place.agents.some((a) => a.id === agentId)) setAgentId(startingAgentId(place))
  }, [place.agents, place.defaultAgentId])

  const disabledReason = place.agents.length === 0 ? place.noAgentsNotice : null

  // A disabled box cannot take focus, so focus waits until it can be written in — once.
  const focused = useRef(false)
  useEffect(() => {
    if (!autoFocus || focused.current || disabledReason) return
    focused.current = true
    box.current?.focus()
  }, [autoFocus, disabledReason])

  const send = async () => {
    const inputText = text.trim()
    if (!inputText || !agentId || sending || disabledReason) return
    setSending(true)
    setError('')
    attempt.current = clientIdFor(attempt.current, inputText)
    try {
      const result = await start({
        home: projectId ? 'PROJECT' : 'PERSON', ...(projectId ? { projectId } : {}),
        agentId, clientMessageId: attempt.current.id, text: inputText,
        ...(skills.skill ? { skill: { name: skills.skill.name } } : {}),
      })
      attempt.current = null
      setText(''); skills.reset(); setSending(false)
      navigate(threadPath(place.basePath, result.conversationId))
    } catch (err: unknown) {
      setError(actionErrorText(err, 'Could not start the conversation'))
      setSending(false)
    }
  }

  if (!mayWork) {
    return <p className="shrink-0 px-4 pb-4 pt-2 text-small text-text-muted">{VIEWER_CANNOT_WORK}</p>
  }

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      {error && <p role="alert" className="mb-2 text-small text-danger">{error}</p>}
      <form
        onSubmit={(e) => { e.preventDefault(); void send() }}
        className="relative flex items-end gap-2 rounded-xl border border-border bg-surface-1 p-2 focus-within:border-accent"
      >
        {skills.skill && <SkillChip skill={skills.skill} onRemove={skills.clear} />}
        <textarea
          ref={box}
          value={text}
          onChange={textarea.onChange}
          onSelect={textarea.onSelect}
          aria-controls={textarea['aria-controls']}
          aria-activedescendant={textarea['aria-activedescendant']}
          onKeyDown={(e) => {
            if (textarea.onKeyFirst(e)) return
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() }
          }}
          placeholder={disabledReason ?? place.composerPlaceholder}
          aria-label={place.composerPlaceholder}
          disabled={!!disabledReason || sending}
          rows={1}
          className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2 py-1.5 text-body text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        {place.agents.length > 0 && (
          <label className="relative shrink-0">
            <span className="sr-only">Agent</span>
            <select
              value={agentId}
              onChange={(e) => { picked.current = true; setAgentId(e.target.value) }}
              disabled={sending}
              className="appearance-none rounded-lg border border-border bg-surface-1 py-1.5 pl-2.5 pr-7 text-small text-text-primary focus:outline-none focus:border-accent/50"
            >
              {place.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <ChevronDown size={12} aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
          </label>
        )}
        {skills.open && agentId && (
          <StartSkillPicker start={{ home: projectId ? 'PROJECT' : 'PERSON', ...(projectId ? { projectId } : {}), agentId }} picker={skills} left={0} />
        )}
        <button
          type="submit"
          aria-label="Send"
          disabled={!text.trim() || !!disabledReason || sending}
          className="flex shrink-0 items-center justify-center rounded-lg bg-accent p-2 text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          <Send size={14} />
        </button>
      </form>
    </div>
  )
})
