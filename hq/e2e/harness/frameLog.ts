/**
 * What a run of the thread harness recorded, frame by frame, and the measures read from it: how the view moved while it
 * followed, how much empty space it left under the last line, and what moved when the reply ended. Every position is in
 * pixels, in the thread's view; the message box's top is under the live line, which floats over the room.
 */
export type Frame = {
  t: number
  /** The script's phase (`thinking`, `streaming`, `ended`, `heard`) and what the test was doing (`person` once it scrolled). */
  phase: string
  label: string
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  /** The follow's transform under a pixel, and the room under the content. */
  shift: number
  room: number
  /** The top of the message box, under the live line. */
  boxTop: number
  /** The revealed character's bottom, else the content's end; the content's end. */
  lineBottom: number
  contentBottom: number
  revealing: boolean
  /** How many replies' buttons the thread shows. */
  buttons: number
}

/** Where the view is, below a pixel: the whole pixels scrolled and the follow's transform. */
export const viewOf = (f: Frame): number => f.scrollTop - f.shift

/** The empty space between the last line shown and the message box. */
export const gapUnder = (f: Frame): number => f.boxTop - f.lineBottom

/** The same, were the thread scrolled all the way down. */
export const gapAtEnd = (f: Frame): number => gapUnder(f) + (f.scrollHeight - f.clientHeight - f.scrollTop)

export type Measures = {
  /** The largest step the view took back up while it followed (px), and how often it turned round. */
  maxBackStep: number
  reversals: number
  /** The largest change of speed from one frame to the next while it followed (px per frame): a lurch. */
  maxLurch: number
  /**
   * How unevenly it moved while it followed a reveal: the root mean square of each frame's step less the average step
   * of the half second around it (px per frame). Easing to each new line in turn shows here as a pulse.
   */
  unevenness: number
  /** While the reply was shown, before its buttons: the most and least space under the revealed line, and at the end. */
  maxGapShown: number
  minGapShown: number
  maxGapAtEnd: number
  /** From the frame before the reply's buttons appeared to the last: how far the view and the scroll's extent moved. */
  movedAtEnd: number
  extentChangeAtEnd: number
  /** At rest after the reply: the space between its buttons and the box. */
  restGap: number
}

const round = (n: number) => Math.round(n * 100) / 100

export function measure(frames: Frame[]): Measures {
  const following = (f: Frame) => f.label !== 'person'
  const steps: (number | null)[] = frames.map((f, i) => i > 0 && following(f) && following(frames[i - 1]!) ? viewOf(f) - viewOf(frames[i - 1]!) : null)
  let maxBackStep = 0, reversals = 0, maxLurch = 0, lastDir = 0, uneven = 0, counted = 0
  steps.forEach((step, i) => {
    if (step === null) { lastDir = 0; return }
    if (step < 0) maxBackStep = Math.max(maxBackStep, -step)
    const dir = Math.abs(step) < 0.01 ? 0 : Math.sign(step)
    if (dir !== 0 && lastDir !== 0 && dir !== lastDir) reversals++
    if (dir !== 0) lastDir = dir
    const before = steps[i - 1]
    if (before !== null && before !== undefined) maxLurch = Math.max(maxLurch, Math.abs(step - before))
    const around = steps.slice(Math.max(0, i - 15), i + 16)
    if (frames[i]!.revealing && around.length === 31 && around.every((s) => s !== null)) {
      const mean = (around as number[]).reduce((a, b) => a + b, 0) / 31
      uneven += (step - mean) ** 2
      counted++
    }
  })
  // The reply's buttons appear: one more reply's buttons than when it was sent.
  const shownAt = frames.findIndex((f) => f.buttons > frames[0]!.buttons)
  const shown = frames.filter((f, i) => (shownAt < 0 || i < shownAt) && f.revealing && following(f))
  const after = shownAt < 1 ? [] : frames.slice(shownAt - 1)
  const last = frames[frames.length - 1]!
  return {
    maxBackStep: round(maxBackStep), reversals, maxLurch: round(maxLurch),
    unevenness: round(counted ? Math.sqrt(uneven / counted) : 0),
    maxGapShown: round(Math.max(-Infinity, ...shown.map(gapUnder))),
    minGapShown: round(Math.min(Infinity, ...shown.map(gapUnder))),
    maxGapAtEnd: round(Math.max(-Infinity, ...shown.map(gapAtEnd))),
    movedAtEnd: after.length ? round(Math.max(...after.map((f) => Math.abs(viewOf(f) - viewOf(after[0]!))))) : NaN,
    extentChangeAtEnd: after.length ? Math.max(...after.map((f) => Math.abs(f.scrollHeight - after[0]!.scrollHeight))) : NaN,
    restGap: round(last.boxTop - last.contentBottom),
  }
}
