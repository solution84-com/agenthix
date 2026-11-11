/**
 * The reveal of one reply, driven every animation frame: its position follows the target on a spring, and only the
 * characters still fading (the band) are touched, by their opacity. React draws the text again only when the text laid
 * out changes; the characters already settled are plain text then.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { advance, atRest, carriesOn, opacityAt, passedTo, relayOut, settle, startReveal, type Aim, type RevealState } from './revealState'
import { hideCursor, onCursors, showCursor, type RevealCursor } from './cursor'
import type { RevealMarks } from './rehypeReveal'

const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The reveals of replies still moving, by the key a caller hands them over under, so the element that takes a reply's
 * place (the stored message after its stream) carries on from where it was. An entry goes once its reply is at rest.
 */
const handedOver = new Map<string, { s: RevealState; at: number }>()
const FORGET_AFTER_MS = 5_000

/**
 * Kept while the reply is streaming or still being revealed (so the stored reply carries on, and reveals a last piece
 * the stream never sent); one left behind is forgotten after a while.
 */
function remember(key: string, s: RevealState, live: boolean) {
  if (handedOver.get(key)?.s === s || (!live && s.x >= s.text.length && s.passed.length === 0)) return
  const now = clock()
  for (const [k, v] of handedOver) if (now - Math.max(v.at, v.s.last ?? 0) > FORGET_AFTER_MS) handedOver.delete(k)
  handedOver.set(key, { s, at: now })
}

/**
 * Whether the reply handed over under `key` is still being revealed, kept up to date as reveals start and end: what can
 * be done with a reply waits until it is whole on screen.
 */
export function useStillRevealing(key: string | null | undefined): boolean {
  return useSyncExternalStore(onCursors, () => !!key && handedOver.has(key), () => false)
}

function takenOver(key: string | undefined, text: string): RevealState | null {
  const left = key ? handedOver.get(key)?.s : undefined
  return left && carriesOn(left, text) ? { ...left, passed: [...left.passed] } : null
}

export type RevealInput = {
  /** The text laid out now. */
  text: string
  /** Where the reveal heads (the voice's place, ahead of it); null: the end of `text`, at the reading pace. */
  target: number | null
  /** The text is arriving (streamed, or revealed with the voice): on first draw it reveals from its start. */
  arriving: boolean
  /** It is still streaming: a half-arrived last word waits. */
  live: boolean
  /** The key the reveal is handed over under. */
  handOver?: string
}

export function useReveal({ text, target, arriving, live, handOver }: RevealInput): { ref: (el: HTMLElement | null) => void; marks: RevealMarks | null } {
  const state = useRef<RevealState | null>(null)
  if (!state.current) {
    const carried = takenOver(handOver, text)
    // A reveal left under this key that this reply does not carry on is forgotten: this reply has the key now.
    if (!carried && handOver) handedOver.delete(handOver)
    state.current = carried ?? startReveal(text, arriving)
  }
  const s = state.current
  relayOut(s, text)
  if (handOver) remember(handOver, s, live)
  const reduced = prefersReducedMotion()
  const aim = useRef<Aim>({ target, live, reduced })
  aim.current = { target, live, reduced }

  // The first character still being revealed, fixed while the text stays the same so the Markdown is not drawn again.
  const from = useMemo(() => settle(s, clock()), [text, s])
  const marks = useMemo<RevealMarks | null>(() => from >= text.length ? null : {
    offset: 0, from, opacity: (i) => opacityAt(s, i, clock(), aim.current.reduced),
  }, [from, text, s])

  const container = useRef<HTMLElement | null>(null)
  const spans = useRef(new Map<number, HTMLElement>())
  const lowest = useRef(Infinity)
  const frame = useRef(0)
  const cursor = useRef<RevealCursor | null>(null)
  if (!cursor.current) {
    cursor.current = {
      // The last character passed that is drawn as a span; before any, the first still to come.
      element: () => {
        const map = spans.current
        for (let i = passedTo(s) - 1; i >= lowest.current; i--) {
          const el = map.get(i)
          if (el) return el
        }
        return map.get(lowest.current) ?? null
      },
    }
  }

  const paint = (now: number) => {
    for (let i = s.base; i < passedTo(s); i++) {
      const el = spans.current.get(i)
      if (el) el.style.opacity = String(opacityAt(s, i, now, aim.current.reduced))
    }
  }
  const moving = (now: number) => !atRest(s, aim.current, now) || s.x < s.text.length || aim.current.live || aim.current.target !== null

  /** Nothing is left to reveal: the thread stops following this reply. */
  const rest = () => {
    // Forgotten first: hiding the cursor tells whoever waits for the reply to be whole (useStillRevealing).
    if (handOver && handedOver.get(handOver)?.s === s) handedOver.delete(handOver)
    hideCursor(cursor.current!)
  }

  const tick = (now: number) => {
    frame.current = 0
    advance(s, aim.current, now)
    paint(now)
    settle(s, now)
    if (!atRest(s, aim.current, now)) frame.current = requestAnimationFrame(tick)
    else if (!moving(now)) rest()
  }

  // After each draw: find the spans, give them their opacity now, and run the frames if anything is left to move.
  useLayoutEffect(() => {
    const el = container.current
    const map = new Map<number, HTMLElement>()
    let low = Infinity
    el?.querySelectorAll<HTMLElement>('[data-c]').forEach((n) => {
      const i = Number(n.dataset.c)
      map.set(i, n)
      low = Math.min(low, i)
    })
    spans.current = map
    lowest.current = low
    const now = clock()
    for (const [i, n] of map) n.style.opacity = String(opacityAt(s, i, now, aim.current.reduced))
    // A reply can come to rest without a frame (voice moved on to the next reply once this one was whole): its cursor
    // goes then too, or the thread would keep following it.
    if (moving(now)) showCursor(cursor.current!)
    else rest()
    if (!frame.current && typeof requestAnimationFrame === 'function' && !atRest(s, aim.current, now)) frame.current = requestAnimationFrame(tick)
  })

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
    hideCursor(cursor.current!)
  }, [])

  const ref = useRef((el: HTMLElement | null) => { container.current = el }).current
  return { ref, marks }
}
