/** The height of every control in a toolbar row or a form: 36 px on a wide screen, 44 px to tap on a phone. */
export const CONTROL_HEIGHT = 'h-9 max-sm:h-11'

/** The accent ring keyboard focus shows on a control, in place of the browser's outline: the same as `Button`'s. */
export const FOCUS_RING = 'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-surface-1),0_0_0_4px_var(--color-accent)]'

/** The same fade at any width, for a view that scrolls sideways and is drawn with it only while more lies to the right. */
export const SCROLL_MORE_FADE = '[mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)]'

/** On a phone, a row that scrolls sideways fades out at its right edge, so a cut item reads as "more this way". */
export const SCROLL_EDGE_FADE = 'max-sm:[mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)]'
