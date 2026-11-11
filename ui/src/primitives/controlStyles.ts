// The shared state classes (DESIGN-SYSTEM.md, "Selection and interaction states"). A component that draws one of
// these states uses the class for it, never a look-alike of its own. Classes that set the same property are
// alternatives: a chosen row takes ROW_CHOSEN in place of ROW_ITEM, never both.

/** The height of every control in a toolbar row or a form: 36 px on a wide screen, 44 px to tap on a phone. */
export const CONTROL_HEIGHT = 'h-9 max-sm:h-11'

/**
 * Keyboard focus on a button, a link, a tab or a clickable card: a 2 px accent outline 2 px outside its edge, for the
 * keyboard only (`:focus-visible`), never on a click. A field shows its own edge instead (`FIELD`).
 */
export const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-accent'

/** The same ring drawn just inside the edge, for a row in a menu or a scrolling list, where one outside would be cut off. */
export const FOCUS_RING_INSET = 'focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-accent'

/**
 * Disabled, for any control: faded to 40 %, no shadow; its hover is left out by the `not-disabled:` classes it uses.
 * A refused control (`aria-disabled`, still focusable: `useRefusal`) looks the same, and drops its hover with `withoutHover`.
 */
export const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:shadow-none'

/** A control's classes without their hover and pressed steps, for a refused control, which `not-disabled:` does not catch. */
export function withoutHover(classes: string): string {
  return classes.split(/\s+/).filter(c => !/(^|:)(hover|active):/.test(c)).join(' ')
}

/**
 * A field (a text box, a select, a date, a search box): the field fill and its hairline; on hover the edge firms up;
 * focused, the edge darkens and a faint halo shows. Never the accent.
 */
export const FIELD = `border border-field-border bg-field text-text-primary placeholder:text-text-muted transition-[border-color,box-shadow] not-disabled:hover:not-focus:border-border-strong focus:border-field-focus focus:shadow-field-focus focus:outline-none ${DISABLED}`

/**
 * The same for a box that holds a field (the Markdown box, the composer): it takes the focus of what is inside it, and
 * shows no hover while the field inside is disabled.
 */
export const FIELD_BOX = 'border border-field-border bg-field transition-[border-color,box-shadow] not-has-[:disabled]:hover:not-focus-within:border-border-strong focus-within:border-field-focus focus-within:shadow-field-focus'

/**
 * A picker in a toolbar or a menu (Sort, ＋ Filter, a filter not set, a list's filter select): plain text, no box; on
 * hover one tone step and ink, pressed one more. The caller gives its height and padding. A boxed select is for a form
 * field only (`FIELD`).
 */
export const PLAIN_CONTROL = `rounded-lg text-small text-text-secondary transition-colors not-disabled:hover:bg-surface-hover not-disabled:hover:text-text-primary not-disabled:active:bg-surface-pressed ${FOCUS_RING} ${DISABLED}`

/** A row in a menu or a list, not chosen: secondary text (its icon `text-text-muted`); hover one tone step and ink, pressed one more. */
export const ROW_ITEM = `text-text-secondary transition-colors not-disabled:hover:bg-surface-hover not-disabled:hover:text-text-primary not-disabled:active:bg-surface-pressed ${DISABLED}`

/** The chosen row in a menu or a list: the selected fill, ink text and icon, medium weight. In place of `ROW_ITEM`. */
export const ROW_CHOSEN = 'bg-selected font-medium text-text-primary [&_svg]:text-text-primary'

const CARD_LIFT = 'transition-[border-color,box-shadow,background-color]'

/**
 * A card that opens something: at rest its hairline; on hover the edge firms up and a soft shadow shows (in dark, one
 * shade lighter); pressed, the shadow drops and the fill goes one step; keyboard focus is the ring. No movement and no
 * colour. A card that only holds information has none of this. The caller gives the card its `border`, radius and fill.
 */
export const CARD_CLICKABLE = `border-border ${CARD_LIFT} not-disabled:hover:border-border-strong not-disabled:hover:bg-card-hover not-disabled:hover:shadow-card-hover not-disabled:active:bg-surface-hover not-disabled:active:shadow-none ${FOCUS_RING} ${DISABLED}`

/** The same, for a card inside the link or button that opens it (the `group`, which takes `FOCUS_RING`). */
export const CARD_CLICKABLE_IN_GROUP = `border-border ${CARD_LIFT} group-hover:border-border-strong group-hover:bg-card-hover group-hover:shadow-card-hover group-active:bg-surface-hover group-active:shadow-none`

/** A chosen card (a plan or an option picked as a card): a firm ink edge, no fill. Added to the card's own classes, `CARD_CLICKABLE` included. */
export const CARD_CHOSEN = 'border-text-primary! inset-ring inset-ring-text-primary'

/** A segmented control's strip (`SegmentedControl`): one soft strip holding the pieces. */
export const SEGMENT_STRIP = `inline-flex shrink-0 items-stretch gap-0.5 rounded-lg bg-segment p-[3px] inset-ring inset-ring-segment-edge ${CONTROL_HEIGHT}`

/**
 * One piece of the strip, chosen or not: add `SEGMENT_CHOSEN` or `SEGMENT_PLAIN`. Disabled, it loses its lift; the
 * 40 % goes on the strip when the whole control is disabled, or on the one piece, so it is never faded twice.
 */
export const SEGMENT_PIECE = `inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-small transition-colors disabled:cursor-not-allowed disabled:shadow-none ${FOCUS_RING}`

/** The chosen piece, raised: the segment's chosen fill, a faint lift, ink text in medium weight. */
export const SEGMENT_CHOSEN = 'bg-segment-chosen font-medium text-text-primary shadow-lift'

/** A piece not chosen: plain secondary text, no box; on hover ink and a faint fill. */
export const SEGMENT_PLAIN = 'text-text-secondary not-disabled:hover:bg-segment-hover not-disabled:hover:text-text-primary'

/** The same fade at any width, for a view that scrolls sideways and is drawn with it only while more lies to the right. */
export const SCROLL_MORE_FADE = '[mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)]'

/** On a phone, a row that scrolls sideways fades out at its right edge, so a cut item reads as "more this way". */
export const SCROLL_EDGE_FADE = 'max-sm:[mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)]'
