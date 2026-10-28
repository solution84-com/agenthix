import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { AudioLines, Hand, Mic, MicOff, Plus, Send, Square } from 'lucide-react'
import type { PickedSkill } from '@agenthix/core'
import { useMentionTarget } from '@agenthix/ui/sessions'
import { MessageField, type MessageFieldHandle } from './MessageField'
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
  /** What voice says of itself, such as "Reconnecting…"; null when nothing. */
  status?: string | null
}

/** How many lines `text` takes at the one-row field's width, measured in a hidden copy of the field. */
function linesAtOneRow(text: string, copy: HTMLDivElement | null, width: number, field: HTMLElement): number {
  if (!text) return 1
  const newlines = text.split('\n').length
  if (!copy || width <= 0) return newlines
  copy.style.width = `${width}px`
  copy.textContent = text.endsWith('\n') ? `${text} ` : text
  const lineHeight = parseFloat(getComputedStyle(field).lineHeight) || 21
  return Math.max(newlines, Math.round(copy.scrollHeight / lineHeight))
}

const NO_VOICE: MessageBoxVoice = {
  available: false, reason: null, heldByOther: false, inVoice: false, speaker: 'none', muted: false,
  onStart: () => undefined, onEnd: () => undefined, onMute: () => undefined,
}

/**
 * The box under a conversation: one pill. At its left a plus that holds the model choice; the text; a microphone
 * that dictates into the box; and one right button — voice when the box is empty, send when it has text, stop while
 * a reply runs. It takes a message at any time, also while a reply is being written (the message then waits). In
 * voice mode, mute and End stand beside the pill and give way while the person types. The text stays in the box
 * when sending is refused.
 */
export function MessageBox({ agentId, conversationId, placeholder, running, sending, onSend, onStop, plus, voice = NO_VOICE, takesMentions = false, takesSkills = false }: {
  placeholder: string
  running: boolean
  sending: boolean
  /** `skill`: the one picked with `/`, beside the text and never in it. */
  onSend: (text: string, skill?: PickedSkill) => Promise<boolean>
  onStop: () => void
  /** What the plus opens: the model choice. */
  plus?: ReactNode
  voice?: MessageBoxVoice
  /** The conversation's agent: dictation uses that agent's own speech to text. */
  agentId?: string
  /** The conversation it writes into, so dictation is costed to its place. */
  conversationId?: string
  /** Mention in a file beside it puts the file's path here, at the caret, shown as a chip; with a conversation, `@` opens a picker of its files. */
  takesMentions?: boolean
  /** With a conversation, `/` at the start of the message opens a picker of its agent's skills; the one chosen is sent beside the text. */
  takesSkills?: boolean
}) {
  const [text, setText] = useState('')
  const mentioned = useCallback((t: string) => field.current?.insertMention(t), [])
  const [menu, setMenu] = useState(false)
  const [why, setWhy] = useState(false)
  const menuRoot = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!menu) return
    const outside = (e: MouseEvent) => { if (menuRoot.current && !menuRoot.current.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [menu])

  // The field grows with what is written, up to its limit, then scrolls;
  // from two lines the text sits above the whole width and the buttons stay in a row underneath. Lines are counted at
  // the one-row field's width whichever layout shows, so the layout never flips back and forth at the edge.
  const [twoLines, setTwoLines] = useState(false)
  const oneRowWidth = useRef(0)
  const mirror = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = field.current?.element()
    if (!el) return
    if (!twoLines && el.isConnected) oneRowWidth.current = el.clientWidth
    setTwoLines(linesAtOneRow(text, mirror.current, oneRowWidth.current, el) >= 2)
  }, [text, twoLines])

  // Voice owns the microphone while it is on.
  useEffect(() => { if (voice.inVoice && dictation.listening) void dictation.finish() }, [voice.inVoice])

  // Send ends dictation first: the words still being heard are asked for, and sent as they stand.
  const submit = async () => {
    if (sending) return
    const value = skills.wordsOf(dictation.listening ? await dictation.finish() : text)
    if (!value) return
    const sent = skills.skill ? await onSend(value, { name: skills.skill.name }) : await onSend(value)
    if (sent) { setText(''); skills.reset() }
  }

  const button = rightButton({
    hasText, running, inVoice: voice.inVoice, available: voice.available, reason: voice.reason, heldByOther: voice.heldByOther,
  })
  const ring = voice.inVoice ? SPEAKER_RING[voice.speaker] : ''

  const more = plus && (
    <div ref={menuRoot} className="relative shrink-0">
      <button
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((o) => !o)}
        className="flex size-9 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text-primary max-lg:size-10"
      >
        <Plus size={18} aria-hidden />
      </button>
      {menu && (
        <div role="menu" data-testid="plus-menu" className="absolute bottom-full left-0 z-30 mb-2 w-max min-w-56 rounded-xl border border-border bg-surface-1 p-2 shadow-pop">
          <p className="px-2 pb-1 text-micro font-semibold uppercase tracking-wide text-text-muted">Model</p>
          {plus}
        </div>
      )}
    </div>
  )
  // Keyed, so it keeps its place (and the focus) when the layout changes.
  const textField = (
    <MessageField
      key="field"
      handle={field}
      text={text}
      onText={dictation.edit}
      onSubmit={() => void submit()}
      onFocus={dictation.prefetch}
      placeholder={placeholder}
      twoLines={twoLines}
      mark={skills.skill ? skillMark(skills.skill.name) : null}
      onCaret={(t, c) => { picker.onCaret(t, c); skills.onCaret(t, c) }}
      onKeyFirst={(e) => skills.onKeyFirst(e) || picker.onKeyFirst(e)}
      listbox={skills.open ? { id: skills.listId, activeId: skills.activeId } : picker.open ? { id: picker.listId, activeId: picker.activeId } : null}
    />
  )
  const mic = !voice.inVoice && (
    <button
      type="button"
      aria-label={dictation.listening ? 'Stop dictating' : 'Dictate'}
      aria-pressed={dictation.listening}
      onClick={dictation.toggle}
      onPointerEnter={dictation.prefetch}
      className={`flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-hover max-lg:size-10 ${dictation.listening ? 'bg-accent-subtle text-accent' : 'text-text-secondary hover:text-text-primary'}`}
    >
      <Mic size={16} aria-hidden />
    </button>
  )
  const right = <RightButton button={button} sending={sending} onStop={onStop} onVoice={voice.onStart} onPrepare={voice.onPrepare} onWhy={() => setWhy(true)} />

  return (
    <div className="shrink-0 px-4 pb-4 pt-2">
      <div className="flex items-end gap-2">
        <form
          ref={pill}
          onSubmit={(e) => { e.preventDefault(); void submit() }}
          data-testid="message-pill"
          data-speaker={voice.inVoice ? voice.speaker : undefined}
          data-two-lines={twoLines || undefined}
          className={`relative flex min-w-0 flex-1 rounded-3xl border border-border bg-surface-1 transition-shadow focus-within:border-accent ${twoLines ? 'flex-col px-1.5 pb-1.5 pt-2' : 'items-end gap-1 p-1.5'} ${ring}`}
        >
          {twoLines ? [
            textField,
            <div key="buttons" className="flex items-center gap-1">{more}<span aria-hidden className="flex-1" />{mic}{right}</div>,
          ] : [
            <Fragment key="more">{more}</Fragment>,
            textField,
            <Fragment key="mic">{mic}</Fragment>,
            <Fragment key="right">{right}</Fragment>,
          ]}
          {skills.open && conversationId && <SkillPicker conversationId={conversationId} picker={skills} left={pickerLeft} />}
          {picker.open && conversationId && <AtPicker conversationId={conversationId} picker={picker} left={pickerLeft} />}
          <div ref={mirror} aria-hidden className="pointer-events-none invisible absolute left-0 top-0 whitespace-pre-wrap break-words px-2 text-body" />
        </form>
        {voice.inVoice && !hasText && (
          <div className="flex shrink-0 items-center gap-1.5 pb-1" data-testid="voice-controls">
            {voice.handRaised && (
              <button
                type="button"
                data-testid="voice-hand-raised"
                aria-label={handRaiseWords(voice.handRaised.agentName)}
                title={handRaiseWords(voice.handRaised.agentName)}
                onClick={voice.handRaised.onInvite}
                className="flex size-9 items-center justify-center rounded-full bg-accent-subtle text-accent ring-1 ring-accent/40 hover:bg-accent/20 max-lg:size-10"
              >
                <Hand size={16} aria-hidden />
              </button>
            )}
            <button
              type="button"
              aria-label={voice.muted ? 'Unmute' : 'Mute'}
              aria-pressed={voice.muted}
              onClick={voice.onMute}
              className="flex size-9 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface-hover max-lg:size-10"
            >
              {voice.muted ? <MicOff size={16} aria-hidden /> : <Mic size={16} aria-hidden />}
            </button>
            <button
              type="button"
              onClick={voice.onEnd}
              className="h-9 rounded-full bg-danger px-3.5 text-small font-medium text-on-accent hover:bg-danger-hover max-lg:h-10"
            >
              End
            </button>
          </div>
        )}
      </div>
      {takesMentions && <MentionTarget onMention={mentioned} />}
      {voice.inVoice && voice.status && (
        <p role="status" data-testid="voice-status" className="px-3 pt-1.5 text-small text-text-secondary">{voice.status}</p>
      )}
      {dictation.error && (
        <p role="alert" className="px-3 pt-1.5 text-small text-danger">{dictation.error}</p>
      )}
      {why && button.kind === 'voice' && button.disabledReason && (
        <p role="status" data-testid="voice-reason" className="px-3 pt-1.5 text-small text-text-muted">{button.disabledReason}</p>
      )}
    </div>
  )
}

/** Takes Mention only while drawn: a box that doesn't take it must not claim it. */
function MentionTarget({ onMention }: { onMention: (text: string) => void }) {
  useMentionTarget(onMention)
  return null
}

function RightButton({ button, sending, onStop, onVoice, onPrepare, onWhy }: {
  button: ReturnType<typeof rightButton>
  sending: boolean
  onStop: () => void
  onVoice: () => void
  onPrepare?: () => void
  onWhy: () => void
}) {
  const base = 'flex size-9 shrink-0 items-center justify-center rounded-full max-lg:size-10'
  switch (button.kind) {
    case 'send':
      return (
        <button type="submit" aria-label="Send" disabled={sending} className={`${base} bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-50`}>
          <Send size={15} aria-hidden />
        </button>
      )
    case 'stop':
      return (
        <button type="button" aria-label="Stop" onClick={onStop} className={`${base} border border-border text-danger hover:bg-surface-hover`}>
          <Square size={12} className="fill-current" aria-hidden />
        </button>
      )
    case 'listening':
      return (
        <span aria-label="Voice is on" role="img" className={`${base} bg-accent-subtle text-accent`}>
          <AudioLines size={16} aria-hidden />
        </span>
      )
    case 'voice': {
      const grey = button.disabledReason !== null
      return (
        <button
          type="button"
          aria-label={grey ? `Start voice (unavailable: ${button.disabledReason})` : 'Start voice'}
          aria-disabled={grey}
          title={button.disabledReason ?? 'Start voice'}
          onClick={grey ? onWhy : onVoice}
          onPointerEnter={grey ? undefined : onPrepare}
          onFocus={grey ? undefined : onPrepare}
          className={`${base} ${grey ? 'cursor-not-allowed bg-surface-2 text-text-muted' : 'bg-accent text-on-accent hover:bg-accent-hover'}`}
        >
          <AudioLines size={16} aria-hidden />
        </button>
      )
    }
  }
}
