/**
 * How the thread moves while replies are shown. Sending holds the person's words at the top of the view, with room
 * under them for the reply, even if they had scrolled away; in voice, so do words as they are said. A typed reply is
 * written there and the view never follows it: the person reads at their own pace, and the round button takes them to
 * the end (and keeps up with the writing) when they ask. A spoken reply is followed a line at a time once it reaches
 * the reading lines, three lines above the box: still while a line is spoken, one short step to the next. The view
 * never moves back up by itself. The person's own scroll lets go of the hold; while it is moving, nothing is written.
 *
 * It also keeps the room under the thread's last line (`nextRoom`), writing it itself, in the same layout as the change
 * that moved it, so no frame is painted with the room of the moment before. While a reply is revealed, the text laid out
 * ahead of the reveal is clipped below its room, so scrolling to the end never shows more than that room.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { cursorIn, onCursors } from '../../shared/components/reveal/cursor'
import { prefersReducedMotion } from '../../shared/components/reveal/useReveal'
import {
  ACTIONS_PX, ACTIONS_PX_NARROW, AT_REST, comesBack, followTarget, heldAim, LINE_PX, letsGo, nextRoom,
  PIN_MARGIN, readingLineAt, releasesRoom, SCROLL_REST_MS, lineStep, stepAt, type LineStep, type ThreadInput,
} from '../components/threadScroll'
import { lineAt } from './revealedLine'

const DOWN_KEYS = new Set(['ArrowDown', 'PageDown', 'End', ' '])

/** Whether the person's words (said or being said) come after `el` in the thread: then the thread's end is followed. */
function wordsAfter(root: HTMLElement | null, el: HTMLElement): boolean {
  const words = root?.querySelectorAll('[data-person-words]')
  const last = words?.[words.length - 1]
  return !!last && !!(el.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING)
}

/** Whether anything is drawn after the turn holding `el`: then nothing below the revealed line may be clipped. */
function shownAfter(el: HTMLElement): boolean {
  for (let n = el.closest('[data-turn]')?.nextElementSibling; n; n = n.nextElementSibling) {
    if ((n as HTMLElement).offsetHeight > 0) return true
  }
  return false
}

/** What a reply's buttons take: those of an earlier reply, as drawn, or the size they are drawn at this width. */
function actionsHeight(content: HTMLElement): number {
  const drawn = content.querySelectorAll<HTMLElement>('[data-testid=reply-actions]')
  const last = drawn[drawn.length - 1]
  if (last && last.offsetHeight > 0) return last.offsetHeight
  const narrow = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 63.98rem)').matches
  return narrow ? ACTIONS_PX_NARROW : ACTIONS_PX
}

export function useThreadFollow({ box, inner, floating, floatingHeight, replying, voice = false, sent = null }: {
  box: RefObject<HTMLDivElement | null>
  /** The thread's content, which the room is kept under as its bottom padding. */
  inner: RefObject<HTMLDivElement | null>
  /** The block floating over the thread's foot (the message box, and the live line above it), where it actually is. */
  floating?: () => HTMLElement | null
  /** The floating block's height, as last measured. */
  floatingHeight: number
  /** A turn is running or streaming. */
  replying: boolean
  /** Voice is on: a reply that starts now is held three lines above the box. */
  voice?: boolean
  /** The newest message the person sent: when it changes, their words are held at the top. */
  sent?: string | null
}) {
  const [following, setFollowing] = useState(true)
  // Text not yet seen below the view (under the message box or further): the jump button shows.
  const [below, setBelow] = useState(false)
  const s = useRef({
    following: true, g: null as { y: number; v: number } | null,
    last: null as number | null, lastSet: NaN, lastTop: 0, shift: 0, frame: 0, jump: true,
    /** The person's scroll is moving, momentum included; `rest` fires once it has stopped. */
    scrolling: false, rest: null as ReturnType<typeof setTimeout> | null,
    /** Let go, then scrolled down to the line: follows again once the scroll rests. */
    returning: false,
    /** The followed line's bottom at the last frame, and where the view holds since text was taken away under it. */
    line: null as number | null, floor: null as number | null,
    /** The room under the last line, the padding written for it, and the height the content is clipped to. */
    room: AT_REST, pad: 0, clip: null as number | null,
    /** Voice: the step to the line being revealed, a line at a time. */
    step: null as LineStep | null,
    /** Voice: the person's words they took control from by scrolling; they are no longer held at the top. */
    unpinned: -1,
    /** Voice: the person's words held at the top (counted among the person's words in the thread). */
    pinned: -1,
    /**
     * Where the thread's scrolling ends while those words are held: their top, less the margin, plus the view's height,
     * in the content. Kept as it is when the words are drawn again or for a moment not at all (voice ending, the message
     * stored), so the room never shrinks under the view; it goes only when the person scrolls or says something new.
     */
    pinEnd: null as number | null,
    /** Voice was on at the last look, and how many of the person's words there were when it came on. */
    wasVoice: false, voiceFrom: 0,
    /** The newest message the person sent, as last seen (undefined before the first look), and a move to the end asked for. */
    sent: undefined as string | null | undefined, toEnd: false,
    /** Typed: the person asked to keep up (the jump button): the end is followed until they scroll or send. */
    chase: false,
    below: false,
  }).current
  const props = useRef({ floating, floatingHeight, replying, voice, sent })
  props.current = { floating, floatingHeight, replying, voice, sent }

  const setPad = (px: number) => {
    if (s.pad === px) return
    s.pad = px
    const el = inner.current
    if (el) el.style.paddingBottom = `${px}px`
  }

  const setClip = (px: number | null) => {
    if (s.clip === px) return
    s.clip = px
    const el = inner.current
    if (!el) return
    el.style.maxHeight = px === null ? '' : `${px}px`
    el.style.overflowY = px === null ? '' : 'clip'
  }

  const setShift = (px: number) => {
    if (s.shift === px) return
    s.shift = px
    const el = inner.current
    if (el) el.style.transform = px ? `translateY(${px.toFixed(3)}px)` : ''
  }

  /** The top of the message box in the thread's view, and its height: the live line above it floats over the room. */
  const boxIn = (el: HTMLElement) => {
    const f = props.current.floating?.()
    const r = f?.getBoundingClientRect()
    if (!f || !r || r.height <= 0) return { foot: el.clientHeight, height: props.current.floatingHeight }
    const live = f.querySelector('[data-testid=live-line]')?.getBoundingClientRect()
    const top = live && live.height > 0 ? live.bottom : r.top
    const foot = top - el.getBoundingClientRect().top
    // The box covers the view from its top down, its margin under it included.
    return { foot, height: Math.max(0, el.clientHeight - foot) }
  }

  /** In voice, where the thread's scrolling ends so the person's latest words are held at the top (`pinEnd`), else null. */
  const pinEndOf = (el: HTMLElement): number | null => {
    // A message waiting to be sent is the person's words too, here.
    const words = inner.current?.querySelectorAll<HTMLElement>('[data-person-words], [data-testid=waiting-message]')
    const n = words?.length ?? 0
    const last = words?.[n - 1]
    // Only words said since voice came on are held: turning voice on moves nothing.
    if (props.current.voice && !s.wasVoice) s.voiceFrom = n
    s.wasVoice = props.current.voice
    // Words said in voice are held as they appear; a message typed and sent is held once it is in the thread.
    if (n - 1 > s.pinned && props.current.voice && n - 1 >= s.voiceFrom && n - 1 !== s.unpinned) s.pinned = n - 1
    if (props.current.sent !== s.sent) {
      if (s.sent !== undefined && props.current.sent && !props.current.voice) {
        // Sending is deliberate: it holds the new words at the top even when the person had scrolled away.
        s.pinned = n - 1
        s.chase = false
        if (!s.following) { s.following = true; s.returning = false; s.g = null; s.step = null; s.floor = null; setFollowing(true) }
        if (!s.frame && typeof requestAnimationFrame === 'function') s.frame = requestAnimationFrame(frame)
      }
      s.sent = props.current.sent
    }
    if (s.pinned < 0 || s.pinned === s.unpinned) { s.pinEnd = null; return null }
    if (last && n - 1 === s.pinned) {
      s.pinEnd = last.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - s.shift - PIN_MARGIN + el.clientHeight
    }
    return s.pinEnd
  }

  /**
   * The reading line in the view; the point followed (`lineBottom`) and the revealed line's bottom (`lineEnd`) in the
   * content, else the content's end for both; and the revealed character, when one is followed.
   */
  const measure = (el: HTMLElement) => {
    const b = el.getBoundingClientRect()
    const content = inner.current
    const actions = content ? actionsHeight(content) : ACTIONS_PX
    const reading = readingLineAt(boxIn(el).foot, s.room.kind, actions)
    // Measured on screen, with the follow's own transform taken back out.
    const inContent = (y: number) => y - b.top + el.scrollTop - s.shift
    const found = cursorIn(el)
    const cursor = found && !wordsAfter(content, found) ? found : null
    if (cursor) {
      const line = lineAt(cursor, LINE_PX)
      return { reading, actions, cursor, lineBottom: inContent(line.bottom), lineEnd: inContent(line.bottom) }
    }
    const end = content ? inContent(content.getBoundingClientRect().bottom) - s.pad : el.scrollHeight
    return { reading, actions, cursor: null, lineBottom: end, lineEnd: end }
  }

  /**
   * The room for what the thread shows now: a reply is shown while a turn runs or streams, a reply is being revealed, or
   * one waits for its voice (`data-reply-pending`). What a reply left goes once it is out of sight.
   */
  const keepRoom = () => {
    const el = box.current
    const content = inner.current
    if (!el || !content) return
    const active = props.current.replying || !!cursorIn(el) || !!content.querySelector('[data-reply-pending]')
    const m = active || s.room.phase !== 'rest' ? measure(el) : null
    s.room = nextRoom(s.room, { active, hidden: el.clientHeight === 0, line: m?.lineEnd ?? 0, voice: props.current.voice, actions: m?.actions })
    const boxHeight = boxIn(el).height
    // In voice, enough room under everything for the person's latest words to reach the top of the view.
    const pin = pinEndOf(el)
    let pad = boxHeight + s.room.gap
    if (pin !== null) {
      const end = content.getBoundingClientRect().bottom - el.getBoundingClientRect().top + el.scrollTop - s.shift - s.pad
      pad = Math.max(pad, Math.ceil(pin - end))
    }
    setPad(pad)
    // Text taken away under the held words (the stream giving way to the stored reply) shortens the scroll before this
    // room is written, and the browser pulls the view up to fit; put it back where it was, before it is painted.
    if (pin !== null && !s.scrolling && el.scrollTop < s.lastTop - 1) el.scrollTop = s.lastTop
    // What is laid out ahead of the reveal is clipped below the room under the revealed line.
    // Not while the person's words are held at the top: the held room is the scroll's end then, and clipping under it
    // would cut the scroll short and move the view.
    if (pin === null && s.room.phase === 'reply' && m?.cursor && !shownAfter(m.cursor)) {
      const top = content.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - s.shift
      setClip(Math.ceil(m.lineEnd - top + s.pad))
    } else setClip(null)
    // What is laid out (revealed, as far as the reveal has come) below where the message box begins.
    const end = (m ?? measure(el)).lineEnd - el.scrollTop - s.shift
    const hidden = end > boxIn(el).foot + 4
    if (hidden !== s.below) { s.below = hidden; setBelow(hidden) }
    if (pin === null && releasesRoom(s.room, el.scrollHeight - el.clientHeight, el.scrollTop)) {
      s.room = AT_REST
      setPad(boxHeight + s.room.gap)
    }
  }

  const frame = (now: number) => {
    s.frame = 0
    const el = box.current
    keepRoom()
    if (!el || !s.following) { setShift(0); return }
    // The person's scroll is still moving: write nothing; its coming to rest wakes the follow, from rest.
    if (s.scrolling) { setShift(0); s.g = null; s.step = null; s.last = null; return }
    // Not shown (a dock folded away): the first frame it is shown puts the line in place at once.
    if (el.clientHeight === 0) { s.jump = true; s.last = null; return }
    const { reading, lineBottom, cursor } = measure(el)
    const max = el.scrollHeight - el.clientHeight
    s.last = now
    // Scrolled by something else (older messages loaded above): carry on from where it is.
    if (s.g === null || Math.abs(el.scrollTop - s.g.y) > 2) s.g = { y: el.scrollTop, v: 0 }
    // Text taken away under the followed line (an interruption): the view stays where it is until the line passes it.
    if (!s.jump && s.line !== null && lineBottom < s.line - 0.5 && s.floor === null) s.floor = s.g.y
    s.line = lineBottom
    const pin = pinEndOf(el)
    const pinAim = pin === null ? null : Math.max(0, Math.min(max, pin - el.clientHeight))
    // A reply keeps the kind it started as (typed or spoken) until it has ended, so turning voice on or off moves nothing.
    const voiceLines = s.room.phase !== 'rest' ? s.room.kind === 'voice' : props.current.voice
    const toLine = followTarget(lineBottom, reading, max)
    // Typed: the view moves only to hold the person's sent words at the top, or to the end when asked (or first
    // shown); it never follows the reply, which the person is reading at their own pace.
    let aim: number
    // Voice follows a spoken reply a line at a time; with none under way it holds, as typed does.
    if (voiceLines && s.room.phase !== 'rest') aim = Math.max(toLine, pinAim ?? 0)
    else if (pinAim !== null) aim = pinAim
    else if (s.chase) aim = Math.max(0, max)
    else if (s.jump || s.toEnd) aim = toLine
    else aim = s.g.y
    if (s.toEnd && Math.abs(s.g.y - aim) < 1) s.toEnd = false
    if (s.floor !== null && aim >= s.floor) s.floor = null
    const want = s.jump ? aim : heldAim(aim, s.floor, max)
    if (s.jump) { s.g = { y: want, v: 0 }; s.step = null }
    else if (prefersReducedMotion()) s.g = { y: Math.max(s.g.y, want), v: 0 }
    else {
      // One short step at a time, then still: in voice a line at a time; typed, to the sent words. Never back up.
      if (want > s.g.y + 0.5 && (!s.step || Math.abs(s.step.to - want) > 0.5)) s.step = lineStep(s.g.y, want, now)
      const y = s.step ? Math.max(s.g.y, stepAt(s.step, now)) : s.g.y
      if (s.step && y >= s.step.to - 0.01) s.step = null
      s.g = { y, v: s.step ? 1 : 0 }
    }
    s.jump = false
    const whole = Math.floor(s.g.y)
    if (el.scrollTop !== whole) el.scrollTop = whole
    s.lastSet = el.scrollTop
    s.lastTop = el.scrollTop
    setShift(-(s.g.y - el.scrollTop))
    if (cursor || want - s.g.y > 0.5 || s.g.v > 1) s.frame = requestAnimationFrame(frame)
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
    s.g = null; s.step = null
    s.floor = null
    s.lastSet = NaN
    setShift(0)
    setFollowing(false)
  }, [])

  /** Follows again from where the view is, at rest, gliding the line onto the reading line. */
  const followAgain = useCallback(() => {
    s.following = true
    s.toEnd = true
    s.chase = true
    // Asked for the end: the sent words are no longer held at the top.
    if (s.pinned >= 0) { s.unpinned = s.pinned; s.pinEnd = null }
    s.returning = false
    s.g = null; s.step = null
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
    keepRoom()
    const top = el.scrollTop
    const lastTop = s.lastTop
    s.lastTop = top
    // Not the follow's own scrolling (none of its own while let go): the person's.
    if (!(Math.abs(top - s.lastSet) < 2)) personScrolls()
    if (s.following) return
    if (top < lastTop) s.returning = false
    else if (comesBack({ top, lastTop, lastSet: s.lastSet, lineBottom: measure(el).lineEnd, viewHeight: el.clientHeight })) s.returning = true
  }, [personScrolls])

  // Only the person's own input lets go, and only upwards. Scrolling down is theirs too: the follow waits for it.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const on = (input: ThreadInput) => {
      // The person took control (any way, any direction): the room that held their words at the top goes, and those
      // words are not held there again. Only their own input: a scroll the browser makes is not theirs.
      if (s.pinned >= 0 && s.pinned !== s.unpinned) { s.unpinned = s.pinned; s.pinEnd = null; keepRoom() }
      s.chase = false
      if (letsGo(input)) letGo()
    }
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

  // Every draw may start or end a reply: its room is in place before the browser paints.
  useLayoutEffect(() => keepRoom())

  // A reveal starting or ending, the content growing (the work bar, a card's detail) or the box growing: follow it.
  // The observer is called after layout and before paint, so a reply's buttons and the room they take come together.
  useEffect(() => {
    const changed = () => { keepRoom(); wake() }
    const stop = onCursors(changed)
    if (typeof ResizeObserver === 'undefined') return stop
    const watch = new ResizeObserver(changed)
    if (inner.current) watch.observe(inner.current)
    const f = props.current.floating?.()
    if (f) watch.observe(f)
    return () => { stop(); watch.disconnect() }
  }, [wake])

  useEffect(() => () => {
    if (s.frame) cancelAnimationFrame(s.frame)
    s.frame = 0
    if (s.rest) clearTimeout(s.rest)
  }, [])

  return { following, below, wake, followAgain, scrolled }
}
