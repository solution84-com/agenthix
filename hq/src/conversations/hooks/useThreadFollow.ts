/**
 * The thread follows the line being revealed: it holds that line a few lines above the floating box and eases to it on
 * a critically damped spring whenever the reveal starts a new line, then holds still. With nothing being revealed, or
 * with the person's words below the reveal, it holds the thread's last line there. Whole pixels are scrolled and the
 * rest is a transform, so the motion is smooth below a pixel. The person lets go by scrolling up; scrolling back down to
 * the line, or ↓, follows again. While the person's scroll is moving, the follow writes nothing.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { springStep } from '../../shared/components/reveal/motion'
import { cursorIn, onCursors } from '../../shared/components/reveal/cursor'
import { prefersReducedMotion } from '../../shared/components/reveal/useReveal'
import { comesBack, FOLLOW_OMEGA, followTarget, heldAim, letsGo, readingLineAt, SCROLL_REST_MS, type ThreadInput } from '../components/threadScroll'

const MAX_STEP_SECS = 0.05
const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', 'End', ' '])

/** Whether the person's words (said or being said) come after `el` in the thread: then the thread's end is followed. */
function wordsAfter(root: HTMLElement | null, el: HTMLElement): boolean {
  const words = root?.querySelectorAll('[data-person-words]')
  const last = words?.[words.length - 1]
  return !!last && !!(el.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING)
}

export function useThreadFollow({ box, inner, floating, endSpace }: {
  box: RefObject<HTMLDivElement | null>
  inner: RefObject<HTMLDivElement | null>
  /** The box floating over the thread's foot, measured where it actually is. */
  floating?: () => HTMLElement | null
  /** The room kept under the last line (`endSpaceFor`). */
  endSpace: number
}) {
  const [following, setFollowing] = useState(true)
  const s = useRef({
    following: true, y: null as number | null, v: 0, last: null as number | null, lastSet: NaN, lastTop: 0, shift: 0, frame: 0, jump: true,
    /** The person's scroll is moving, momentum included; `rest` fires once it has stopped. */
    scrolling: false, rest: null as ReturnType<typeof setTimeout> | null,
    /** Let go, then scrolled down to the line: follows again once the scroll rests. */
    returning: false,
    /** The followed line's bottom at the last frame, and where the view holds since text was taken away under it. */
    line: null as number | null, floor: null as number | null,
  }).current
  const room = useRef({ endSpace, floating })
  room.current = { endSpace, floating }

  const setShift = (px: number) => {
    if (s.shift === px) return
    s.shift = px
    const el = inner.current
    if (el) el.style.transform = px ? `translateY(${px.toFixed(3)}px)` : ''
  }

  /** The reading line in the view, and the bottom of the line being revealed (else the last line) in the content. */
  const measure = (el: HTMLElement) => {
    const b = el.getBoundingClientRect()
    const f = room.current.floating?.()?.getBoundingClientRect()
    const reading = readingLineAt(f && f.height > 0 ? f.top - b.top : el.clientHeight)
    // Measured on screen, with the follow's own transform taken back out.
    const inContent = (r: DOMRect) => r.bottom - b.top + el.scrollTop - s.shift
    const found = cursorIn(el)
    const cursor = found && !wordsAfter(inner.current, found) ? found : null
    const lineBottom = cursor ? inContent(cursor.getBoundingClientRect())
      : inner.current ? inContent(inner.current.getBoundingClientRect()) - room.current.endSpace : el.scrollHeight
    return { reading, lineBottom, revealing: !!cursor }
  }

  const frame = (now: number) => {
    s.frame = 0
    const el = box.current
    if (!el || !s.following) { setShift(0); return }
    // The person's scroll is still moving: write nothing; its coming to rest wakes the follow, from rest.
    if (s.scrolling) { setShift(0); s.y = null; s.last = null; return }
    // Not shown (a dock folded away): the first frame it is shown puts the line in place at once.
    if (el.clientHeight === 0) { s.jump = true; s.last = null; return }
    const { reading, lineBottom, revealing } = measure(el)
    const max = el.scrollHeight - el.clientHeight
    const dt = s.last === null ? 0 : Math.min(MAX_STEP_SECS, (now - s.last) / 1000)
    s.last = now
    // Scrolled by something else (older messages loaded above): carry on from where it is.
    if (s.y === null || Math.abs(el.scrollTop - s.y) > 2) { s.y = el.scrollTop; s.v = 0 }
    // Text taken away under the followed line (an interruption): the view stays where it is until the line passes it.
    if (!s.jump && s.line !== null && lineBottom < s.line - 0.5 && s.floor === null) s.floor = s.y
    s.line = lineBottom
    const aim = followTarget(lineBottom, reading, max)
    if (s.floor !== null && aim >= s.floor) s.floor = null
    const want = s.jump ? aim : heldAim(aim, s.floor, max)
    if (s.jump || prefersReducedMotion()) {
      s.y = want
      s.v = 0
      s.jump = false
    } else {
      const next = springStep({ x: s.y, v: s.v }, want, dt, FOLLOW_OMEGA)
      s.y = next.x
      s.v = next.v
    }
    const whole = Math.floor(s.y)
    if (el.scrollTop !== whole) el.scrollTop = whole
    s.lastSet = el.scrollTop
    s.lastTop = el.scrollTop
    setShift(-(s.y - el.scrollTop))
    if (revealing || Math.abs(want - s.y) > 0.5 || Math.abs(s.v) > 1) s.frame = requestAnimationFrame(frame)
    else s.last = null
  }

  const wake = useCallback(() => {
    if (s.frame || !s.following || typeof requestAnimationFrame !== 'function') return
    s.frame = requestAnimationFrame(frame)
  }, [])

  const letGo = useCallback(() => {
    s.returning = false
    if (!s.following) return
    s.following = false
    s.y = null
    s.floor = null
    s.lastSet = NaN
    setShift(0)
    setFollowing(false)
  }, [])

  /** Follows again from where the view is, at rest, easing the line onto the reading line. */
  const followAgain = useCallback(() => {
    s.following = true
    s.returning = false
    s.y = null
    s.v = 0
    s.floor = null
    setFollowing(true)
    wake()
  }, [wake])

  /** The person's scroll moved: the follow waits until it has stopped for `SCROLL_REST_MS`. */
  const personScrolls = useCallback(() => {
    s.scrolling = true
    if (s.rest) clearTimeout(s.rest)
    s.rest = setTimeout(() => {
      s.rest = null
      s.scrolling = false
      if (!s.following && s.returning) followAgain()
      else wake()
    }, SCROLL_REST_MS)
  }, [followAgain, wake])

  /** A scroll of the thread: the person scrolling down to the line being revealed follows again once it rests. */
  const scrolled = useCallback(() => {
    const el = box.current
    if (!el) return
    const top = el.scrollTop
    const lastTop = s.lastTop
    s.lastTop = top
    // Not the follow's own scrolling (none of its own while let go): the person's.
    if (!(Math.abs(top - s.lastSet) < 2)) personScrolls()
    if (s.following) return
    if (top < lastTop) s.returning = false
    else if (comesBack({ top, lastTop, lastSet: s.lastSet, lineBottom: measure(el).lineBottom, viewHeight: el.clientHeight })) s.returning = true
  }, [personScrolls])

  // Only the person's own input lets go, and only upwards. Scrolling down is theirs too: the follow waits for it.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const on = (input: ThreadInput) => { if (letsGo(input)) letGo() }
    const wheel = (e: WheelEvent) => { on({ kind: 'wheel', deltaY: e.deltaY }); if (e.deltaY > 0) personScrolls() }
    const touch = () => on({ kind: 'touch' })
    const key = (e: KeyboardEvent) => { on({ kind: 'key', key: e.key }); if (DOWN_KEYS.has(e.key)) personScrolls() }
    const press = (e: PointerEvent) => on({ kind: 'press', onScrollBar: e.target === el })
    el.addEventListener('wheel', wheel, { passive: true })
    el.addEventListener('touchstart', touch, { passive: true })
    el.addEventListener('keydown', key)
    el.addEventListener('pointerdown', press)
    return () => {
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('touchstart', touch)
      el.removeEventListener('keydown', key)
      el.removeEventListener('pointerdown', press)
    }
  }, [letGo, personScrolls])

  // A reveal starting or ending, the content growing (the work bar, a card's detail) or the box growing: follow it.
  useEffect(() => {
    const stop = onCursors(wake)
    if (typeof ResizeObserver === 'undefined') return stop
    const watch = new ResizeObserver(wake)
    if (inner.current) watch.observe(inner.current)
    const f = room.current.floating?.()
    if (f) watch.observe(f)
    return () => { stop(); watch.disconnect() }
  }, [wake])

  useEffect(() => () => {
    if (s.frame) cancelAnimationFrame(s.frame)
    s.frame = 0
    if (s.rest) clearTimeout(s.rest)
  }, [])

  return { following, wake, followAgain, scrolled }
}
