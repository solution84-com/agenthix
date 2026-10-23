import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { getSpeechToken } from 'wasp/client/operations'
import { createSpeechInput, type EndableSpeechInput, type SttConfig } from '../voiceClient/speechInput'
import { createSpeechTrace, type SpeechTrace } from '../voiceClient/speechTiming'
import { beginDictation, editText, hearSpeech, movePosition, turnOpen, type DictationText } from './dictationText'

/** How long Send and Stop wait for the service to finish the words still being heard. */
export const FINISH_WAIT_MS = 500
/** A token is used again until this long before it expires. */
const TOKEN_MARGIN_MS = 60_000
/** Dictation ends a turn on a shorter silence than a voice conversation: nothing waits on it. */
const DICTATION_CONFIG = { max_turn_silence: 1000 }

type Token = { token: string; expiresAt: string; config?: SttConfig }

/**
 * Dictation into the message box: the microphone is open only while it is on, and what is heard goes into the
 * box as it is spoken — as ordinary text, corrected in place when the service formats it — for the person to
 * read and send. Nothing is sent by itself.
 */
export function useDictation({ text, setText, field, agentId }: {
  text: string
  setText: (text: string) => void
  field: RefObject<HTMLTextAreaElement | null>
  /** Whose own speech to text to use; none means the organisation's default. */
  agentId?: string
}) {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<EndableSpeechInput | null>(null)
  const state = useRef<DictationText | null>(null)
  const textNow = useRef(text)
  textNow.current = text
  const cursor = useRef<[number, number] | null>(null)
  const settled = useRef<(() => void) | null>(null)
  const token = useRef<Token | null>(null)
  const fetching = useRef<Promise<Token> | null>(null)
  const finishing = useRef<Promise<string> | null>(null)
  const trace = useRef<SpeechTrace | null>(null)

  const getToken = useCallback(async (): Promise<Token> => {
    const held = token.current
    if (held && Date.parse(held.expiresAt) - TOKEN_MARGIN_MS > Date.now()) return held
    fetching.current ??= getSpeechToken(agentId ? { agentId } : undefined)
      .then((t) => { token.current = t as Token; return t as Token })
      .finally(() => { fetching.current = null })
    return fetching.current
  }, [agentId])

  const show = useCallback((next: DictationText) => {
    const before = state.current
    const el = field.current
    if (before && el && document.activeElement === el) {
      cursor.current = [movePosition(before, next, el.selectionStart), movePosition(before, next, el.selectionEnd)]
    }
    state.current = next
    textNow.current = next.text
    setText(next.text)
    if (!turnOpen(next)) settled.current?.()
  }, [field, setText])

  useLayoutEffect(() => {
    const el = field.current
    const at = cursor.current
    if (!el || !at) return
    cursor.current = null
    el.setSelectionRange(at[0], at[1])
  }, [text, field])

  const close = useCallback(() => {
    input.current?.stop()
    input.current = null
    trace.current?.print()
    trace.current = null
    state.current = null
    settled.current = null
    setListening(false)
  }, [])

  /** Ends dictation: asks the service for the words still being heard, waits briefly, and keeps what is shown. */
  const finish = useCallback((): Promise<string> => {
    const open = input.current
    if (!open) return Promise.resolve(textNow.current)
    if (finishing.current) return finishing.current
    const run = (async () => {
      const now = state.current
      if (now && turnOpen(now)) {
        open.endTurn()
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, FINISH_WAIT_MS)
          settled.current = () => { clearTimeout(timer); resolve() }
        })
      }
      close()
      return textNow.current
    })()
    // Cleared only once this run is the one held: a run that ends at once must not leave itself behind for the
    // next dictation to return.
    finishing.current = run
    void run.finally(() => { if (finishing.current === run) finishing.current = null })
    return run
  }, [close])

  const start = useCallback(async () => {
    setError(null)
    const el = field.current
    state.current = beginDictation(textNow.current, el ? el.selectionEnd : textNow.current.length)
    const hear = (final: boolean) => (heard: string, order: number | null) => {
      let now = state.current
      if (!now || input.current !== made) return
      // The box is the person's: if it changed outside dictation (sent, cleared), the heard words go after it.
      if (now.text !== textNow.current) now = editText(now, textNow.current)
      show(hearSpeech(now, { text: heard, order, final }))
    }
    // Development builds only: the production build drops this, and nothing is sent anywhere.
    trace.current = import.meta.env.DEV ? createSpeechTrace() : null
    const made = createSpeechInput({
      getToken,
      trace: trace.current ?? undefined,
      config: DICTATION_CONFIG,
      onPartial: hear(false),
      onTurn: hear(true),
      onLoud: () => undefined,
      watchLoud: () => false,
      onFail: (message) => { close(); setError(message) },
    })
    input.current = made
    setListening(true)
    try {
      await made.start()
    } catch (err) {
      close()
      setError(err instanceof Error ? err.message : 'Dictation could not start.')
    }
  }, [close, field, getToken, show])

  /** The person typed: their text and cursor are kept, and the heard words move with them. */
  const edit = useCallback((value: string) => {
    if (state.current) { state.current = editText(state.current, value); textNow.current = value }
    setText(value)
  }, [setText])

  useEffect(() => () => { input.current?.stop() }, [])

  return {
    listening,
    error,
    edit,
    finish,
    /** Fetches a token ahead, so pressing the microphone connects at once. */
    prefetch: () => { void getToken().catch(() => undefined) },
    toggle: () => (input.current ? void finish() : void start()),
    clearError: () => setError(null),
  }
}
