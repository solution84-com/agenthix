import { FOCUS_RING } from '@agenthix/ui/primitives'

// 44 px to tap, the same as every button the phone's top bar holds (menu or Back, the chat's, the ⋯).
export const TOP_BAR_BUTTON = `flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover active:bg-surface-pressed transition-colors ${FOCUS_RING}`
