import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { AudioLines, Hand, Mic, MicOff, Send, Square, X } from 'lucide-react'
import type { PickedSkill } from '@agenthix/core'
import { useMentionTarget } from '@agenthix/ui/sessions'
import { BUTTON_DANGER, BUTTON_GHOST, BUTTON_PRIMARY, FIELD_BOX, DISABLED, FOCUS_RING, Tooltip, useRefusal, withoutHover, type Refusal } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'
import { MessageField, type MessageFieldHandle } from './MessageField'
import { PlusMenu, type PlusItem } from './composerPlus'
import { useDictation } from '../hooks/useDictation'
import { AtPicker } from './atPicker/AtPicker'
import { useAtPicker } from './atPicker/useAtPicker'
import { SkillPicker } from './atPicker/SkillPicker'
import { useSkillPicker } from './atPicker/useSkillPicker'
import { skillMark } from './atPicker/slashQuery'
import { handRaiseWords, rightButton, SPEAKER_RING, type Speaker } from '../voiceClient/voiceUi'

export type MessageBoxVoice = {
  available: boolean
  reason: string | null
  /** Someone else holds voice in this conversation. */
  heldByOther: boolean
  /** Voice is on here, for this person. */
  inVoice: boolean
  speaker: Speaker
  muted: boolean
  onStart: () => void
  /** Voice may be started soon: get ready, so starting does not wait. */
  onPrepare?: () => void
  onEnd: () => void
  onMute: () => void
  /** An agent has raised its hand: the badge shows, and a tap invites it. */
  handRaised?: { agentName: string | undefined; onInvite: () => void } | null
}

const NO_VOICE: MessageBoxVoice = {
  available: false, reason: null, heldByOther: false, inVoice: false, speaker: 'none', muted: false,
  onStart: () => undefined, onEnd: () => undefined, onMute: () => undefined,
}

/**
 * The box under a conversation: one pill of two rows. Row one is what is typed. Row two has the plus (only when
 * something gives it items), the model as its own chip, then a microphone that dictates into the box and one right
 * button — voice when the box is empty, send when it has text, stop while a reply runs. It takes a message at any time, also while a reply is being written (the message then waits). In
 * a call the box keeps its two buttons: the microphone becomes Mute (a raised hand just left of it) and the right
 * button a round End, which gives way to Send while the person types. Nothing sits outside the box. The text stays
 * in the box when sending is refused.
 */
export function MessageBox({ agentId, conversationId, placeholder, running, sending, onSend, onStop, plusItems = [], model, voice = NO_VOICE, takesMentions = false, takesSkills = false, tray, onFiles, hasShared = false, refusal }: {
  placeholder: string
  running: boolean
  sending: boolean
  /** `skill`: the one picked with `/`, beside the text and never in it. */
  onSend: (text: string, skill?: PickedSkill) => Promise<boolean>
  onStop: () => void
  /** What the plus can add; with none, the plus is not drawn. */
  plusItems?: PlusItem[]
  /** The model's chip, in row two beside the plus. */
  model?: ReactNode
  voice?: MessageBoxVoice
  /** The conversation's agent: dictation uses that agent's own speech to text. */
  agentId?: string
  /** The conversation it writes into, so dictation is costed to its place. */
  conversationId?: string
  /** Mention in a file beside it puts the file's path here, at the caret, shown as a chip; with a conversation, `@` opens a picker of its files. */
  takesMentions?: boolean
  /** With a conversation, `/` at the start of the message opens a picker of its agent's skills; the one chosen is sent beside the text. */
  takesSkills?: boolean
  /** What was added to the message before sending, drawn above what is typed. */
  tray?: ReactNode
  /** Files pasted or dropped onto the box; without it, only their text is taken. */
  onFiles?: (files: File[]) => void
  /** Something was added, so the message may be sent with no words. */
  hasShared?: boolean
  /** The box cannot be written in now (a closed conversation, no access): it is greyed, the reason in its tooltip, and a press opens the dialog. */
  refusal?: Refusal
}) {
  const [text, setText] = useState('')
  const refused = useRefusal(refusal)
  const mentioned = useCallback((t: string) => field.current?.insertMention(t), [])
  const [dragging, setDragging] = useState(false)
  const field = useRef<MessageFieldHandle>(null)
  const dictation = useDictation({ text, setText, field, agentId, conversationId })
  const picker = useAtPicker({ enabled: takesMentions && !!conversationId, field })
  const skills = useSkillPicker({ enabled: takesSkills && !!conversationId, field, text, setText })
  const open = picker.open || skills.open
  const pill = useRef<HTMLFormElement>(null)
  const [pickerLeft, setPickerLeft] = useState(0)
  useLayoutEffect(() => {
    if (!open) return
    const caret = field.current?.caretRect()
    const box = pill.current?.getBoundingClientRect()
    if (caret && box) setPickerLeft(Math.max(0, Math.min(caret.left - box.left, box.width - 320)))
  }, [open, picker.fragment, skills.fragment])
  const hasText = skills.wordsOf(text).length > 0

  // Voice owns the microphone while it is on.
  useEffect(() => { if (voice.inVoice && dictation.listening) void dictation.finish() }, [voice.inVoice])

  // Send ends dictation first: the words still being heard are asked for, and sent as they stand.
  const submit = async () => {
    if (sending) return
    const value = skills.wordsOf(dictation.listening ? await dictation.finish() : text)
    if (!value && !hasShared) return
    const sent = skills.skill ? await onSend(value, { name: skills.skill.name }) : await onSend(value)
    if (sent) { setText(''); skills.reset() }
  }

  const button = rightButton({
    hasText: hasText || hasShared, running, inVoice: voice.inVoice, available: voice.available, reason: voice.reason, heldByOther: voice.heldByOther,
  })
  const ring = voice.inVoice ? SPEAKER_RING[voice.speaker] : ''

  const textField = (
    <MessageField
      key="field"
      handle={field}
      text={text}
      onText={dictation.edit}
      onSubmit={() => void submit()}
      onFocus={dictation.prefetch}
      placeholder={placeholder}
      mark={skills.skill ? skillMark(skills.skill.name) : null}
      onCaret={(t, c) => { picker.onCaret(t, c); skills.onCaret(t, c) }}
      onKeyFirst={(e) => skills.onKeyFirst(e) || picker.onKeyFirst(e)}
      listbox={skills.open ? { id: skills.listId, activeId: skills.activeId } : picker.open ? { id: picker.listId, activeId: picker.activeId } : null}
    />
  )
  const mic = voice.inVoice ? (
    <>
      {voice.handRaised && (
        <button
          type="button"
          data-testid="voice-hand-raised"
          aria-label={handRaiseWords(voice.handRaised.agentName)}
          title={handRaiseWords(voice.handRaised.agentName)}
          onClick={voice.handRaised.onInvite}
          className={`${ICON_BUTTON} ${BUTTON_GHOST} bg-selected text-text-primary`}
        >
          <Hand size={16} aria-hidden />
        </button>
      )}
      <button
        type="button"
        aria-label={voice.muted ? 'Unmute' : 'Mute'}
        title={voice.muted ? 'Unmute' : 'Mute'}
        aria-pressed={voice.muted}
        onClick={voice.onMute}
        className={`${ICON_BUTTON} ${BUTTON_GHOST} ${voice.muted ? 'bg-selected text-text-primary' : ''}`}
      >
        {voice.muted ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
      </button>
    </>
  ) : (
    <button
      type="button"
      aria-label={dictation.listening ? 'Stop dictating' : 'Dictate'}
      aria-pressed={dictation.listening}
      onClick={dictation.toggle}
      onPointerEnter={dictation.prefetch}
      className={`${ICON_BUTTON} ${BUTTON_GHOST} ${dictation.listening ? 'bg-selected text-text-primary' : ''}`}
    >
      <Mic size={16} aria-hidden />
    </button>
  )
  const right = <RightButton button={button} sending={sending} onStop={onStop} onEnd={voice.onEnd} onVoice={voice.onStart} onPrepare={voice.onPrepare} />

  const inside = (
    <>
          {tray}
          {textField}
          <div className="flex items-center gap-1" data-testid="message-actions">
            <PlusMenu items={plusItems} />
            {model}
            <span aria-hidden className="flex-1" />
            {mic}
            {right}
          </div>
    </>
  )
  const pillForm = (
        <form
          ref={pill}
          onSubmit={(e) => { e.preventDefault(); void submit() }}
          onPaste={onFiles && ((e) => { const files = [...e.clipboardData.files]; if (files.length) { e.preventDefault(); onFiles(files) } })}
          onDragOver={onFiles && ((e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } })}
          onDragLeave={onFiles && ((e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false) })}
          onDrop={onFiles && ((e) => { setDragging(false); const files = [...e.dataTransfer.files]; if (files.length) { e.preventDefault(); onFiles(files) } })}
          data-testid="message-pill"
          data-speaker={voice.inVoice ? voice.speaker : undefined}
          {...refused.props}
          tabIndex={refusal ? 0 : undefined}
          onKeyDown={refusal ? (e) => { if (e.key === 'Enter' || e.key === ' ') refused.props.onClick?.(e as unknown as ReactMouseEvent) } : undefined}
          className={`relative flex min-w-0 flex-1 flex-col rounded-3xl px-1.5 pb-1.5 pt-2 shadow-composer ${refusal ? `${withoutHover(FIELD_BOX)} ${DISABLED} cursor-not-allowed ${FOCUS_RING}` : FIELD_BOX} ${dragging ? 'border-text-primary!' : ''} ${ring}`}
        >
          {refusal ? <div inert className="contents">{inside}</div> : inside}
          {skills.open && conversationId && <SkillPicker conversationId={conversationId} picker={skills} left={pickerLeft} />}
          {picker.open && conversationId && <AtPicker conversationId={conversationId} picker={picker} left={pickerLeft} />}
        </form>
  )

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      <div className="flex items-end gap-2">
        {refused.tooltip ? <Tooltip label={refused.tooltip} side="top" wrap>{pillForm}</Tooltip> : pillForm}
      </div>
      {takesMentions && <MentionTarget onMention={mentioned} />}
      {refused.dialog}
      <ShowAttention text={dictation.error} title="Dictation stopped" onClose={dictation.clearError} />
    </div>
  )
}

/** Takes Mention only while drawn: a box that doesn't take it must not claim it. */
function MentionTarget({ onMention }: { onMention: (text: string) => void }) {
  useMentionTarget(onMention)
  return null
}

/** The round icon buttons of the box's second row: one size, and larger to touch. */
const ICON_BUTTON = 'flex size-9 shrink-0 items-center justify-center rounded-full max-lg:size-10'

/** How to send, said where the person is about to press it; nothing is added to the page for it. */
export const SEND_TOOLTIP = 'Send (Enter) · Shift+Enter for a new line'

function RightButton({ button, sending, onStop, onEnd, onVoice, onPrepare }: {
  button: ReturnType<typeof rightButton>
  sending: boolean
  onStop: () => void
  onEnd: () => void
  onVoice: () => void
  onPrepare?: () => void
}) {
  const refused = useRefusal(button.kind === 'voice' && button.disabledReason ? { reason: button.disabledReason, title: 'Voice is not available' } : undefined)
  const main = `${ICON_BUTTON} ${BUTTON_PRIMARY}`
  switch (button.kind) {
    case 'send':
      return (
        <button type="submit" aria-label="Send" title={SEND_TOOLTIP} disabled={sending} className={main}>
          <Send size={15} aria-hidden />
        </button>
      )
    case 'stop':
      return (
        <button type="button" aria-label="Stop" onClick={onStop} className={`${ICON_BUTTON} ${BUTTON_GHOST} border border-border text-danger!`}>
          <Square size={12} className="fill-current" aria-hidden />
        </button>
      )
    case 'end':
      return (
        <button type="button" aria-label="End the call" title="End the call" onClick={onEnd} className={`${ICON_BUTTON} ${BUTTON_DANGER}`}>
          <X size={16} aria-hidden />
        </button>
      )
    case 'voice': {
      const voiceButton = (
        <button
          type="button"
          aria-label="Start voice"
          {...refused.props}
          onClick={refused.props.onClick ?? onVoice}
          onPointerEnter={refused.tooltip ? undefined : onPrepare}
          onFocus={refused.tooltip ? undefined : onPrepare}
          className={refused.tooltip ? `${withoutHover(main)} ${DISABLED}` : main}
        >
          <AudioLines size={16} aria-hidden />
        </button>
      )
      if (!refused.tooltip) return voiceButton
      return <><Tooltip label={refused.tooltip} side="top" wrap>{voiceButton}</Tooltip>{refused.dialog}</>
    }
  }
}
