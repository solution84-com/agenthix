import { CONTROL_HEIGHT, FOCUS_RING, OPENS_MENU } from '@agenthix/ui/primitives'

/** An icon-only button: 36 px, 44 px to tap on a phone; the selected fill while its menu is open. */
export const ICON_BUTTON = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 max-sm:h-11 max-sm:w-11 ${OPENS_MENU} ${FOCUS_RING}`

/** A typed field drawn as every field is: white, bordered, the control height (as `NativeSelect`). */
export const FIELD = `${CONTROL_HEIGHT} rounded-lg border border-border bg-surface-1 px-2.5 text-small text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-60`

/** The same field, saying what is wrong with it. */
export const FIELD_BAD = 'border-danger ring-1 ring-danger'

/** A section's small heading inside a card: "What it does", "When". */
export const CARD_LABEL = 'mb-1 text-micro font-medium uppercase tracking-wide text-text-muted'

/** A link-like button: the accent's words, the grey fill on hover. */
export const LINK_BUTTON = `inline-flex items-center gap-1 rounded-lg px-1 text-small text-accent hover:bg-surface-hover max-sm:min-h-11 ${FOCUS_RING}`

/** A row that scrolls sideways on a phone fades at its right edge: `SCROLL_EDGE_FADE`, which the library does not export. */
export const EDGE_FADE = 'max-sm:[mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)]'
