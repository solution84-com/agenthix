import { useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AudioLines, Send } from 'lucide-react'
import { BUTTON_PRIMARY, DISABLED, FIELD_BOX, FOCUS_RING, Tooltip, useRefusal, withoutHover } from '@agenthix/ui/primitives'
import { useAction, useQuery, startConversation, getConversationAgentChoices, getMyModelAccess } from 'wasp/client/operations'
import { useMentionTarget } from '@agenthix/ui/sessions'
import type { ConversationAgentView } from '../../shared/conversations/protocol'
import { Nudge, ReadNudgesHeld, ShowAttention, isFinal } from '@agenthix/ui/attention'
import { useVoiceCall } from '../../shared/providers/VoiceCallProvider'
import { useDemo } from '../../demo/useDemo'
import { actionErrorText, clientIdFor } from '../hooks/threadState'
import { threadPath } from '../threadPaths'
import { AgentPicker } from './AgentPicker'
import { StartModelPicker } from './StartModelPicker'
import { randomId } from '../../shared/randomId'
import { microphonePossible, SECURE_PAGE_WORDS } from '../../shared/securePage'
import { StartSkillPicker } from './atPicker/SkillPicker'
import { SkillBackdrop } from './atPicker/SkillBackdrop'
import { useStartSkillPicker } from './atPicker/useStartSkillPicker'
import { SuggestedPrompts } from '../../demo/lead/SuggestedPrompts'
import { useSuggestedPrompts } from '../../demo/lead/useSuggestedPrompts'

/**
 * The message box that starts a conversation — on Home, in Chat and in a project. Typing and sending creates it
 * with the person's primary agent; before that first message two quiet buttons choose the agent and the model. The
 * server's reason fills the place of the box when the person may not talk here. Empty, its right button is voice:
 * it creates the conversation with no message, opens it and starts voice there, so what the person says is its
 * first message. Greyed when the chosen agent cannot talk, its reason shown on a tap. Once the agent is known, `/` at
 * the start of the message picks one of its skills, sent beside the first message. It is the one box a conversation
 * is started from: the dock's, Home's, a place's Conversations and an agent's page (`onlyAgentIds`, that agent alone).
 */
export function NewConversationBox({ home, projectId, basePath, placeholder, noAgentsNotice, autoFocus = false, agentId: given, onlyAgentIds, onAgentChange }: {
  home: 'PERSON' | 'PROJECT'
  projectId?: string
  /** The place whose list the new conversation opens under: `/chat` or `/projects/KEY`. */
  basePath: string
  placeholder: string
  noAgentsNotice: string
  autoFocus?: boolean
  /** The agent to start with, when it is one of the choices here; the person can still pick another. */
  agentId?: string
  /** Only these of the agents that may be talked to here are offered: an agent's page offers that agent alone. */
  onlyAgentIds?: readonly string[]
  /** Called with the agent the box starts with, and again with each one the person picks. */
  onAgentChange?: (agent: ConversationAgentView | null) => void
}) {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const start = useAction(startConversation)
  const voiceCall = useVoiceCall()
  const demo = useDemo()
  const { data: allChoices, error: choicesError, refetch: refetchChoices } = useQuery(getConversationAgentChoices, { home, projectId })
  const onlyKey = onlyAgentIds?.join(',')
  const choices = useMemo(
    () => (allChoices && onlyAgentIds ? allChoices.filter((a) => onlyAgentIds.includes(a.id)) : allChoices),
    // Keyed by the ids, so a list given anew each render does not make a new choice list.
    [allChoices, onlyKey], // eslint-disable-line react-hooks/exhaustive-deps
  )
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
  // The demo's suggestions for the chosen agent (ADR-0186); none outside the demo.
  const prompts = useSuggestedPrompts(current?.handle)
  // hq's reason first; then the page, which must be secure for the microphone.
  const voiceRefusal = current ? current.voiceRefusal ?? (demo.on || microphonePossible() ? null : SECURE_PAGE_WORDS) : null
  const report = useRef(onAgentChange)
  report.current = onAgentChange
  const reported = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    const id = current?.id ?? null
    if (!choices || reported.current === id) return
    reported.current = id
    report.current?.(current ?? null)
  }, [choices, current])

  // Someone who cannot talk to agents yet: the whole box is greyed, and a press says why and where to fix it.
  const { data: access } = useQuery(getMyModelAccess)
  const talkRefusal = access && !access.canTalk && access.fix
    ? {
        reason: "Agents can't answer you yet",
        title: "Agents can't answer you yet",
        detail: <>
          {access.added.model ? 'No model is working' : 'No model provider has been added'}.{' '}
          {access.isAdmin ? <Link to="/admin/providers" className="text-link hover:underline">Manage organisation › Providers</Link> : 'An organisation admin can set one up.'}
        </>,
      }
    : undefined
  const noTalk = useRefusal(talkRefusal)
  const refused = useRefusal(voiceRefusal ? { reason: voiceRefusal, title: 'Voice is not available' } : undefined)
  const voiceButton = (
    <button
      type="button"
      aria-label="Start voice"
      disabled={sending}
      {...refused.props}
      onClick={refused.props.onClick ?? (() => void talk())}
      onPointerEnter={voiceRefusal ? undefined : () => voiceCall.prepare(agentId || undefined)}
      onFocus={voiceRefusal ? undefined : () => voiceCall.prepare(agentId || undefined)}
      className={`flex shrink-0 items-center justify-center rounded-lg p-2 ${voiceRefusal ? `${withoutHover(BUTTON_PRIMARY)} ${DISABLED}` : BUTTON_PRIMARY}`}
    >
      <AudioLines size={14} aria-hidden />
    </button>
  )

  // Data before error: the agents read once stay when a re-read of them fails.
  const unread = !allChoices && choicesError ? choicesError : null
  const readsHeld = useContext(ReadNudgesHeld)
  const reason = unread ? unread.message : choices && choices.length === 0 ? noAgentsNotice : null
  const focused = useRef(false)
  useEffect(() => {
    if (!autoFocus || focused.current || reason || !choices) return
    focused.current = true
    // The box fills in late, once its agents are known: it never takes the caret from a field being typed in.
    const typing = document.activeElement
    if (typing instanceof HTMLElement && typing !== box.current && typing.matches('input, textarea, select, [contenteditable]')) return
    box.current?.focus()
  }, [autoFocus, reason, choices])
  // Taken off the page (React's development run does so once, between two runs of every effect), the box takes the
  // caret again when it is back: an overlay round it may have moved the caret meanwhile.
  useEffect(() => () => { focused.current = false }, [])

  /** `suggestion`: one of the demo's suggestions, tapped, sent as it is. */
  const send = async (suggestion?: string) => {
    const value = suggestion ?? skills.wordsOf(text)
    if (!value || !agentId || sending || reason) return
    setSending(true)
    setError('')
    attempt.current = clientIdFor(attempt.current, value)
    try {
      const result = await start({
        home, projectId, clientMessageId: attempt.current.id, text: value,
        ...(picked || given || wanted ? { agentId } : {}),
        ...(model ? { model } : {}),
        ...(skills.skill && suggestion === undefined ? { skill: { name: skills.skill.name } } : {}),
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
    setSending(true)
    setError('')
    try {
      const result = await start({
        home, projectId, clientMessageId: randomId(), text: '', voice: true,
        ...(picked || given || wanted ? { agentId } : {}),
        ...(model ? { model } : {}),
      })
      const path = threadPath(basePath, result.conversationId)
      voiceCall.start(result.conversationId, { handle: current.handle, name: current.name, avatarUrl: current.avatarUrl }, path)
      setSending(false)
      navigate(path)
    } catch (err) {
      setError(actionErrorText(err, 'Could not start the conversation'))
      setSending(false)
    }
  }

  // The agents could not be read through the retries: said in place of the box, with Try again unless it is final.
  if (unread) {
    return (
      <div className="shrink-0 px-4 pb-4 pt-2">
        {isFinal(unread)
          ? <Nudge place="meta">{unread.message}</Nudge>
          : readsHeld ? null : <Nudge place="meta" action={{ label: 'Try again', onClick: () => void refetchChoices() }}>The agents could not be read: HQ did not answer.</Nudge>}
      </div>
    )
  }
  if (reason) return <p className="shrink-0 px-4 pb-4 pt-2 text-small text-text-muted">{reason}</p>

  const inside = (
    <>
        <SkillBackdrop text={text} skill={skills.skill?.name ?? null}>
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
          className="relative max-h-32 min-h-[36px] w-full resize-none bg-transparent px-2 py-1.5 text-body text-text-primary placeholder:text-text-muted focus:outline-none"
        />
        </SkillBackdrop>
        {skills.open && current && <StartSkillPicker start={{ home, ...(projectId ? { projectId } : {}), agentId }} picker={skills} left={0} />}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            {choices && <AgentPicker agents={choices} selectedId={agentId} onSelect={setPicked} disabled={sending} above />}
            <StartModelPicker home={home} projectId={projectId} picked={model} onPick={setModel} disabled={sending} />
          </div>
          {skills.wordsOf(text) || !current ? (
            <button
              type="submit"
              aria-label="Send"
              disabled={!skills.wordsOf(text) || sending || !agentId}
              className={`flex shrink-0 items-center justify-center rounded-lg p-2 ${BUTTON_PRIMARY}`}
            >
              <Send size={14} />
            </button>
          ) : (
            refused.tooltip ? <Tooltip label={refused.tooltip} side="top" wrap>{voiceButton}</Tooltip> : voiceButton
          )}
        </div>
    </>
  )
  const formEl = (
      <form
        onSubmit={(e) => { e.preventDefault(); void send() }}
        {...noTalk.props}
        tabIndex={talkRefusal ? 0 : undefined}
        onKeyDown={talkRefusal ? (e) => { if (e.key === 'Enter' || e.key === ' ') noTalk.props.onClick?.(e as unknown as ReactMouseEvent) } : undefined}
        className={`relative flex flex-col gap-1 rounded-xl p-2 ${talkRefusal ? `${withoutHover(FIELD_BOX)} ${DISABLED} cursor-not-allowed ${FOCUS_RING}` : FIELD_BOX}`}
      >
      {talkRefusal ? <div inert className="contents">{inside}</div> : inside}
      </form>
  )

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      <ShowAttention kind="alert" text={error} title="The conversation was not started" onClose={() => setError('')} />
      {refused.dialog}
      {noTalk.dialog}
      {!talkRefusal && (
        <SuggestedPrompts prompts={prompts} disabled={sending || !agentId} onPick={prompt => { setText(prompt); void send(prompt) }} />
      )}
      {noTalk.tooltip ? <Tooltip label={noTalk.tooltip} side="top" wrap>{formEl}</Tooltip> : formEl}
    </div>
  )
}
