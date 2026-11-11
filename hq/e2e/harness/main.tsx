/**
 * The thread harness's page: hq's real thread (ThreadMessages, its follow and its room) under a stand-in of the floating
 * box, with a scripted reply, so how the thread moves can be watched and measured in a real browser.
 *
 * `?mode=typed` (the default) streams a long reply in chunks at a model's pace; `?mode=voice` streams the same reply and
 * reveals it with a pretend voice, a playhead moving through its sentences word by word. Send (or `harness.send()`)
 * starts it. Every frame, after layout and before paint, the page records where the thread is (`harness.frames`).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './harness.css'
import type { ConversationMessageView } from '../../src/shared/conversations/protocol'
import type { StreamState } from '../../src/conversations/hooks/threadState'
import { ThreadMessages } from '../../src/conversations/components/ThreadMessages'
import { LiveLine } from '../../src/conversations/components/LiveLine'
import type { ReplyView } from '../../src/conversations/components/ReplyBody'
import { useFloatingRoom } from '../../src/conversations/hooks/useFloatingRoom'
import { spokenReveal, type TimedSentence } from '../../src/conversations/voiceClient/reveal'
import { setHeardCut } from '../../src/conversations/voiceClient/heardCut'
import type { Playhead } from '../../src/conversations/voiceClient/playback'
import { REVEAL } from '../../src/shared/components/reveal/pace'
import { cursorIn } from '../../src/shared/components/reveal/cursor'
import { REPLY as WHOLE_REPLY, HISTORY } from './script'
import type { Frame } from './frameLog'

const params = new URLSearchParams(location.search)
const MODE = params.get('mode') === 'voice' ? 'voice' : 'typed'
/** The stream's pace: a chunk of 10 to 40 characters every 50 to 130 ms, about 300 characters a second. */
const CHUNK = { min: 10, max: 40, minMs: 50, maxMs: 130 }
const THINK_MS = 900
/** `?chars=` cuts the reply short, at the end of a sentence, for a shorter run. */
const REPLY = cutAt(WHOLE_REPLY, Number(params.get('chars')) || Infinity)
function cutAt(text: string, chars: number): string {
  if (chars >= text.length) return text
  const end = text.slice(0, chars).search(/[.!?][^.!?]*$/)
  return end < 0 ? text.slice(0, chars) : text.slice(0, end + 1)
}
/** The pretend voice: each word takes this long, and it starts once the first sentence has arrived. */
const WORD_SECS = Number(params.get('wordSecs')) || 0.3
const VOICE_START_MS = 600

const agent = { id: 'a1', name: 'Kernel', handle: 'kernel', avatarUrl: null }
const at = '2026-11-11T10:00:00.000Z'
const message = (seq: number, role: 'PERSON' | 'AGENT', text: string, turnId: string | null): ConversationMessageView => ({
  id: `m${seq}`, seq, clientMessageId: null, role, authorId: role === 'PERSON' ? 'harness-person' : null, agentId: role === 'AGENT' ? 'a1' : null,
  kind: 'TEXT', body: { text }, spoken: false, interrupted: false, withdrawn: false, encouragement: false, operationId: null, turnId,
  queueState: null, createdAt: at,
} as ConversationMessageView)

/** A small seeded random number source, so every run streams the same chunks. */
function seeded(seed: number) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 }
}

/** The reply's sentences as hq's voice sends them: where each lies in the text, and when each of its words starts. */
function sentencesOf(text: string): (TimedSentence & { wordEndSecs: number[] })[] {
  const out: (TimedSentence & { wordEndSecs: number[] })[] = []
  const re = /[^.!?\n]+[.!?]*\s*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (!m[0].trim()) continue
    const words = m[0].trim().split(/\s+/)
    out.push({
      index: out.length, textStart: m.index, textEnd: m.index + m[0].trimEnd().length, words,
      wordStartSecs: words.map((_, i) => i * WORD_SECS), wordEndSecs: words.map((_, i) => (i + 1) * WORD_SECS - 0.04),
    })
  }
  return out
}
const ALL_SENTENCES = sentencesOf(REPLY)

declare global {
  interface Window { harness: { send: () => void; endVoice?: () => void; phase: () => string; frames: Frame[]; label: string; mode: string } }
}
window.harness = { send: () => {}, phase: () => 'rest', frames: [], label: 'rest', mode: MODE }

function App() {
  const [messages, setMessages] = useState<ConversationMessageView[]>(() => HISTORY.flatMap(([q, a], i) => [
    message(i * 2 + 1, 'PERSON', q, null), message(i * 2 + 2, 'AGENT', a, `t${i}`),
  ]))
  const [running, setRunning] = useState(false)
  const [stream, setStream] = useState<StreamState | null>(null)
  const [since, setSince] = useState<number | null>(null)
  const [voice, setVoice] = useState<{ turnId: string; head: Playhead | null; sentences: TimedSentence[] } | null>(null)
  const floating = useFloatingRoom()
  const [inVoice, setInVoice] = useState(MODE === 'voice')
  const voiceNow = useRef<typeof voice>(null)
  voiceNow.current = voice
  const callEnded = useRef(false)
  const phase = useRef('rest')

  const send = useCallback(() => {
    if (phase.current !== 'rest' && phase.current !== 'ended') return
    const turnId = `live-${Date.now()}`
    const random = seeded(7)
    setMessages((ms) => [...ms, message(ms.length + 1, 'PERSON', 'Walk me through how the follow should behave, in detail.', null)])
    setRunning(true)
    setSince(Date.now())
    phase.current = 'thinking'
    let sent = 0
    const chunk = () => {
      if (callEnded.current) return
      sent = Math.min(REPLY.length, sent + CHUNK.min + Math.floor(random() * (CHUNK.max - CHUNK.min)))
      setStream({ turnId, text: REPLY.slice(0, sent) })
      if (sent < REPLY.length) { setTimeout(chunk, CHUNK.minMs + random() * (CHUNK.maxMs - CHUNK.minMs)); return }
      setTimeout(() => {
        // The turn ends: the stored reply takes the stream's place in the same draw.
        setStream(null)
        setRunning(false)
        setMessages((ms) => [...ms, message(ms.length + 1, 'AGENT', REPLY, turnId)])
        phase.current = 'ended'
      }, 250)
    }
    setTimeout(() => { phase.current = 'streaming'; chunk() }, THINK_MS)
    if (MODE === 'voice') startVoice(turnId, () => sent)
  }, [])

  /** The pretend voice: a playhead through the sentences that have arrived, a frame at a time, like hq's speaker. */
  const startVoice = (turnId: string, arrived: () => number) => {
    // As hq's speaker holds a reply from its first words: none of it shows until its voice is heard.
    setVoice({ turnId, head: null, sentences: [] })
    let started: number | null = null
    let index = 0
    let sentenceAt = 0
    const tick = (now: number) => {
      if (callEnded.current) return
      const ready = ALL_SENTENCES.filter((s) => s.textEnd <= arrived() || arrived() >= REPLY.length)
      if (ready.length === 0) { requestAnimationFrame(tick); return }
      if (started === null) { started = now + VOICE_START_MS; sentenceAt = started }
      if (now < started) { setVoice({ turnId, head: null, sentences: ready }); requestAnimationFrame(tick); return }
      const s = ALL_SENTENCES[index]!
      const length = s.words.length * WORD_SECS
      let elapsed = (now - sentenceAt) / 1000
      if (elapsed >= length && index + 1 < ready.length) { index++; sentenceAt += length * 1000; elapsed = (now - sentenceAt) / 1000 }
      const ended = elapsed >= length
      const last = index === ALL_SENTENCES.length - 1 && ended
      if (last && phase.current === 'ended') { setVoice(null); phase.current = 'heard'; return }
      setVoice({ turnId, head: { index, elapsed: Math.min(elapsed, length), ended }, sentences: ready })
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  /** The person ends the call while the reply is spoken: as hq does, its text is cut where they stopped hearing it. */
  const endVoice = useCallback(() => {
    callEnded.current = true
    setHeardCut(voiceNow.current)
    setVoice(null)
    setInVoice(false)
    // hq stops the turn: the stream goes at once, and the stored reply, cut where it was heard, comes a moment later.
    const v = voiceNow.current
    const shown = v ? spokenReveal(v, v.turnId, REPLY, 0)?.layout ?? 0 : 0
    setStream(null)
    setRunning(false)
    setTimeout(() => {
      setMessages((ms) => [...ms, message(ms.length + 1, 'AGENT', REPLY.slice(0, shown), v?.turnId ?? null)])
      phase.current = 'ended'
    }, 500)
  }, [])

  useEffect(() => {
    window.harness.endVoice = endVoice
    window.harness.send = send
    window.harness.phase = () => phase.current
  }, [send])

  const reply = useMemo<ReplyView>(() => ({
    inVoice,
    limitFor: (turnId, text) => spokenReveal(voice, turnId, text, REVEAL.leadMs / 1000)?.layout ?? null,
    targetFor: (turnId, text) => spokenReveal(voice, turnId, text, REVEAL.leadMs / 1000)?.target ?? null,
    onOpenPart: () => {},
  }), [voice, inVoice])

  return (
    <div className="flex h-screen flex-col bg-surface-1">
      <header className="flex h-14 shrink-0 items-center border-b border-border-subtle px-4 text-small text-text-secondary">
        Thread harness: {MODE === 'voice' ? 'a spoken reply' : 'a typed reply'}
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ThreadMessages
          floatingHeight={floating.height} floating={floating.element}
          messages={messages} waiting={[]} stream={stream} running={running} turnId={running ? stream?.turnId ?? null : null}
          turnSince={since} agent={agent} hasMore={false} loadingOlder={false} onLoadOlder={() => {}} busy={false}
          onSendNow={() => {}} onCancel={() => {}} reply={reply}
        />
        {/* As ConversationThread draws it: the box floats over the thread's foot, which fades out above it. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10" data-testid="floating-box">
          <div aria-hidden className="absolute inset-x-0 -top-8 bottom-0 bg-gradient-to-t from-surface-1 from-70% to-transparent" />
          <div ref={floating.ref} className="pointer-events-auto relative mx-auto w-full max-w-[720px]">
            {(running || stream) && <LiveLine agentName="Kernel" run={{ since, steps: [], writing: !!stream?.text }} />}
            <div className="mx-4 mb-4 flex h-24 items-end justify-end rounded-2xl border border-border-subtle bg-surface-0 p-3">
              {inVoice && <button type="button" data-testid="harness-end-voice" onClick={endVoice} className="mr-2 rounded-full border border-border-subtle px-4 py-1.5 text-small">End voice</button>}
              <button type="button" data-testid="harness-send" onClick={send} className="rounded-full bg-accent px-4 py-1.5 text-small text-white">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The recorder: a hidden element whose width changes every frame, so its observer is called each frame after the
 * frame's own callbacks and layout, just before paint, and reads what is about to be painted.
 */
function record() {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;left:0;top:0;height:1px;visibility:hidden'
  document.body.appendChild(probe)
  let flip = false
  const read = () => {
    const box = document.querySelector<HTMLElement>('[data-testid=thread-messages]')
    const inner = document.querySelector<HTMLElement>('[data-testid=thread-end-space]')
    const float = document.querySelector<HTMLElement>('[data-testid=floating-box] > div.relative')
    if (!box || !inner || !float) return
    const top = box.getBoundingClientRect().top
    const room = parseFloat(inner.style.paddingBottom || '0')
    const shift = Number(/translateY\((-?[\d.]+)px\)/.exec(inner.style.transform)?.[1] ?? 0)
    const contentBottom = inner.getBoundingClientRect().bottom - room - top
    const cursor = cursorIn(box)
    // The message box's top: under the live line, which floats over the room.
    const live = float.querySelector('[data-testid=live-line]')
    window.harness.frames.push({
      t: performance.now(), phase: window.harness.phase(), label: window.harness.label, scrollTop: box.scrollTop, scrollHeight: box.scrollHeight,
      clientHeight: box.clientHeight, shift, room,
      boxTop: (live ? live.getBoundingClientRect().bottom : float.getBoundingClientRect().top) - top,
      lineBottom: cursor ? cursor.getBoundingClientRect().bottom - top : contentBottom, contentBottom,
      revealing: !!cursor, buttons: box.querySelectorAll('[data-testid=reply-actions]').length,
    })
  }
  new ResizeObserver(read).observe(probe)
  const tick = () => { flip = !flip; probe.style.width = flip ? '2px' : '1px'; requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}

createRoot(document.getElementById('root')!).render(<App />)
setTimeout(record, 300)
