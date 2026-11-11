import { DISABLED, FOCUS_RING } from './controlStyles'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

// What differs between portals is a token (tokens.css, "Buttons"): hq's values draw hq's buttons as they always were;
// the Fleet Console's give its gradient primary and its quiet outline danger. The outlines are inset rings, which
// take no room, so a ring hq draws transparent changes no size. Hover is one step and pressed one more (the main button
// a deeper indigo each time); a disabled button has neither. Keyboard focus is FOCUS_RING, the outline outside the edge.
export const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary:   'bg-accent bg-(image:--button-primary-image) not-disabled:hover:bg-accent-hover not-disabled:hover:bg-none not-disabled:active:bg-accent-press not-disabled:active:bg-none text-on-accent shadow-primary ring-1 ring-inset ring-button-primary-ring',
  secondary: 'bg-button-secondary text-text-primary border border-border not-disabled:hover:bg-surface-hover not-disabled:hover:border-border-strong not-disabled:active:bg-surface-pressed',
  ghost:     'text-text-secondary not-disabled:hover:text-text-primary not-disabled:hover:bg-surface-hover not-disabled:active:bg-surface-pressed',
  danger:    'bg-button-danger not-disabled:hover:bg-button-danger-hover not-disabled:active:bg-button-danger-press text-button-danger-text ring-1 ring-inset ring-button-danger-ring',
}

const BARE = `transition-colors ${FOCUS_RING} ${DISABLED}`

/**
 * The main, the secondary, the ghost and the danger button's looks for a link or a bare element that cannot be a `Button` (an icon
 * button among them): the same strings `Button` draws, with focus and disabled. The caller sets the radius, size and
 * weight (`rounded-button font-button` is what `Button` uses).
 */
export const BUTTON_PRIMARY = `${BARE} ${BUTTON_VARIANT.primary}`
export const BUTTON_SECONDARY = `${BARE} ${BUTTON_VARIANT.secondary}`
export const BUTTON_GHOST = `${BARE} ${BUTTON_VARIANT.ghost}`
export const BUTTON_DANGER = `${BARE} ${BUTTON_VARIANT.danger}`
