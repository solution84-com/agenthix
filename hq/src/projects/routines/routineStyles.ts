import { CONTROL_HEIGHT, DISABLED, FIELD as FIELD_STYLE, FOCUS_RING, OPENS_MENU } from '@agenthix/ui/primitives'

/** An icon-only button: 36 px, 44 px to tap on a phone; the selected fill while its menu is open. */
export const ICON_BUTTON = `inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-text-muted not-disabled:hover:bg-surface-hover not-disabled:hover:text-text-primary ${DISABLED} max-sm:h-11 max-sm:w-11 ${OPENS_MENU} ${FOCUS_RING}`

/** A typed field drawn as every field is: white, bordered, the control height (as `NativeSelect`). */
export const FIELD = `${CONTROL_HEIGHT} rounded-lg px-2.5 text-small ${FIELD_STYLE}`

/** The same field, saying what is wrong with it. */
export const FIELD_BAD = 'border-danger ring-1 ring-danger'

/** A section's small heading inside a card: "What it does", "When". */
export const CARD_LABEL = 'mb-1 text-micro font-medium uppercase tracking-wide text-text-muted'

/** A link-like button: the accent's words, the grey fill on hover. */
export const LINK_BUTTON = `inline-flex items-center gap-1 rounded-lg px-1 text-small text-link hover:bg-surface-hover max-sm:min-h-11 ${FOCUS_RING}`

/** A row that scrolls sideways on a phone fades at its right edge: `SCROLL_EDGE_FADE`, which the library does not export. */
export const EDGE_FADE = 'max-sm:[mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)]'
