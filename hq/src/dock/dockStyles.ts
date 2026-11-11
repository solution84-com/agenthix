import { BUTTON_GHOST, BUTTON_SECONDARY } from '@agenthix/ui/primitives'

/** The chat bar's icon buttons: 36 px (the design guide's sizes). */
export const DOCK_BUTTON = `flex h-9 w-9 items-center justify-center rounded-lg ${BUTTON_GHOST}`

/** The draft's Cancel, a text button in place of the icon buttons: the secondary button, small. */
export const CANCEL_BUTTON = `rounded-lg px-2.5 py-1 text-small font-medium ${BUTTON_SECONDARY}`

/** The button whose pop-up, panel or page is open. */
export const SELECTED = 'bg-selected text-text-primary'
