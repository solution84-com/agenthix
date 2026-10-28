import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { AudioLines, Send } from 'lucide-react'
import { useAction, useQuery, startConversation, getConversationAgentChoices } from 'wasp/client/operations'
import { useMentionTarget } from '@agenthix/ui/sessions'
import type { ConversationAgentView } from '../../shared/conversations/protocol'
import { RefusedAction } from '../../shared/components/RefusedAction'
import { useVoiceCall } from '../../shared/providers/VoiceCallProvider'
import { actionErrorText, clientIdFor } from '../hooks/threadState'
import { threadPath } from '../threadPaths'
import { AgentPicker } from './AgentPicker'
import { StartModelPicker } from './StartModelPicker'
import { randomId } from '../../shared/randomId'
import { microphonePossible, SECURE_PAGE_WORDS } from '../../shared/securePage'
import { StartSkillPicker } from './atPicker/SkillPicker'
import { SkillChip } from './atPicker/SkillChip'
import { useStartSkillPicker } from './atPicker/useStartSkillPicker'

/**
 * The message box that starts a conversation — on Home, in Chat and in a project. Typing and sending creates it
 * with the person's primary agent; before that first message two quiet buttons choose the agent and the model. The
 * server's reason fills the place of the box when the person may not talk here. Empty, its right button is voice:
 * it creates the conversation with no message, opens it and starts voice there, so what the person says is its
 * first message. Greyed when the chosen agent cannot talk, its reason shown on a tap. Once the agent is known, `/` at
 * the start of the message picks one of its skills, sent beside the first message.
 */
export function NewConversationBox({ home, projectId, basePath, placeholder, noAgentsNotice, autoFocus = false, agentId: given, onAgentChange }: {
  home: 'PERSON' | 'PROJECT'
  projectId?: string
  /** The place whose list the new conversation opens under: `/chat` or `/projects/KEY`. */
  basePath: string
  placeholder: string
  noAgentsNotice: string
  autoFocus?: boolean
  /** The agent to start with, when it is one of the choices here; the person can still pick another. */
  agentId?: string
  /** Called with the agent the box starts with, and again with each one the person picks. */
  onAgentChange?: (agent: ConversationAgentView | null) => void
}) {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const start = useAction(startConversation)
  const voiceCall = useVoiceCall()
  const [why, setWhy] = useState(false)
  const { data: choices, error: choicesError } = useQuery(getConversationAgentChoices, { home, projectId })
  const [text, setText] = useState('')
  useMentionTarget(useCallback((t: string) => setText((p) => (p.trim() ? `${p.trimEnd()} ${t} ` : `${t} `)), []))
  const [picked, setPicked] = useState<string | null>(null)
  const [model, setModel] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const attempt = useRef<{ text: string; id: string } | null>(null)

  // The first choice is the person's primary agent; a link from a closed conversation can name another.
  const wanted = search.get('agent')
  const agentId = [picked, given, wanted].find((id) => id && choices?.some((a) => a.id === id)) ?? choices?.[0]?.id ?? ''
  const current = choices?.find((a) => a.id === agentId)
  const { skills, box, textarea } = useStartSkillPicker({ enabled: Boolean(current), agentId, text, setText })
  // hq's reason first; then the page, which must be secure for the microphone.
  const voiceRefusal = current ? current.voiceRefusal ?? (microphonePossible() ? null : SECURE_PAGE_WORDS) : null
  const report = useRef(onAgentChange)
  report.current = onAgentChange
  const reported = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const id = current?.id ?? null
    if (!choices || reported.current === id) return
    reported.current = id
    report.current?.(current ?? null)
  }, [choices, current])

  const reason = choicesError ? choicesError.message : choices && choices.length === 0 ? noAgentsNotice : null
  const focused = useRef(false)
  useEffect(() => {
    if (!autoFocus || focused.current || reason || !choices) return
    focused.current = true
    box.current?.focus()
  }, [autoFocus, reason, choices])

  const send = async () => {
    const value = text.trim()
    if (!value || !agentId || sending || reason) return
    setSending(true)
    setError('')
    attempt.current = clientIdFor(attempt.current, value)
    try {
      const result = await start({
        home, projectId, clientMessageId: attempt.current.id, text: value,
        ...(picked || given || wanted ? { agentId } : {}),
        ...(model ? { model } : {}),
        ...(skills.skill ? { skill: { name: skills.skill.name } } : {}),
      })
      attempt.current = null
      setText(''); skills.reset(); setSending(false)
      navigate(threadPath(basePath, result.conversationId))
    } catch (err) {
      setError(actionErrorText(err, 'Could not start the conversation'))
      setSending(false)
    }
  }

  const talk = async () => {
    if (!current || sending || reason) return
    if (voiceRefusal) { setWhy(true); return }
    setSending(true)
    setError('')
    try {
      const result = await start({
        home, projectId, clientMessageId: randomId(), text: '', voice: true,
        ...(picked || given || wanted ? { agentId } : {}),
        ...(model ? { model } : {}),
      })
      const path = threadPath(basePath, result.conversationId)
      voiceCall.start(result.conversationId, { name: current.name, avatarUrl: current.avatarUrl }, path)
      setSending(false)
      navigate(path)
    } catch (err) {
      setError(actionErrorText(err, 'Could not start the conversation'))
      setSending(false)
    }
  }

  if (reason) return <p className="shrink-0 px-4 pb-4 pt-2 text-small text-text-muted">{reason}</p>

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      <RefusedAction reason={error} className="mb-2" />
      <form
        onSubmit={(e) => { e.preventDefault(); void send() }}
        className="relative flex flex-col gap-1 rounded-xl border border-border bg-surface-1 p-2 focus-within:border-accent"
      >
        {skills.skill && <div className="flex px-1"><SkillChip skill={skills.skill} onRemove={skills.clear} /></div>}
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
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={sending}
          rows={1}
          className="max-h-32 min-h-[36px] w-full resize-none bg-transparent px-2 py-1.5 text-body text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        {skills.open && current && <StartSkillPicker start={{ home, ...(projectId ? { projectId } : {}), agentId }} picker={skills} left={0} />}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {choices && <AgentPicker agents={choices} selectedId={agentId} onSelect={setPicked} disabled={sending} above />}
            <StartModelPicker home={home} projectId={projectId} picked={model} onPick={setModel} disabled={sending} />
          </div>
          {text.trim() || !current ? (
            <button
              type="submit"
              aria-label="Send"
              disabled={!text.trim() || sending || !agentId}
              className="flex shrink-0 items-center justify-center rounded-lg bg-accent p-2 text-on-accent hover:bg-accent-hover disabled:opacity-50"
            >
              <Send size={14} />
            </button>
          ) : (
            <button
              type="button"
              aria-label={voiceRefusal ? `Start voice (unavailable: ${voiceRefusal})` : 'Start voice'}
              aria-disabled={Boolean(voiceRefusal)}
              title={voiceRefusal ?? 'Start voice'}
              disabled={sending}
              onClick={() => void talk()}
              onPointerEnter={voiceRefusal ? undefined : () => voiceCall.prepare(agentId || undefined)}
              onFocus={voiceRefusal ? undefined : () => voiceCall.prepare(agentId || undefined)}
              className={`flex shrink-0 items-center justify-center rounded-lg p-2 disabled:opacity-50 ${voiceRefusal ? 'cursor-not-allowed bg-surface-2 text-text-muted' : 'bg-accent text-on-accent hover:bg-accent-hover'}`}
            >
              <AudioLines size={14} aria-hidden />
            </button>
          )}
        </div>
      </form>
      {why && voiceRefusal && !text.trim() && (
        <p role="status" data-testid="voice-reason" className="px-3 pt-1.5 text-small text-text-muted">{voiceRefusal}</p>
      )}
    </div>
  )
}
