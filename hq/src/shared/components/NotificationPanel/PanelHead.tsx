import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { BUTTON_GHOST, PanelHeaderContent, PANEL_HEADER_ROW } from '@agenthix/ui/primitives'
import { useShellPanels } from '../../context/useShellPanels'
import { useIsMobile } from '../../hooks/useIsMobile'

/**
 * The one header row of the Notifications or Runs panel, or of a view inside it.
 * On a wide screen: the title, then its action and ✕. On a phone, where the
 * panel fills the screen: ‹ back out of it, named after it, then its action.
 * A view inside the panel passes its own way back (‹ Notifications).
 */
export function PanelHead({ title, back, onBack, action }: {
  title: string
  back?: string
  onBack?: () => void
  action?: ReactNode
}) {
  const { close } = useShellPanels()
  const isMobile = useIsMobile()
  const closeButton = !isMobile && (
    <button
      type="button"
      onClick={close}
      aria-label="Close the panel"
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${BUTTON_GHOST}`}
    >
      <X size={16} />
    </button>
  )
  const trailing = (action || closeButton) ? <>{action}{closeButton}</> : undefined
  return (
    <div className={PANEL_HEADER_ROW}>
      {back && onBack
        ? <PanelHeaderContent back={back} onBack={onBack} title={title} action={trailing} />
        : isMobile
          ? <PanelHeaderContent back={title} onBack={close} action={trailing} />
          : <PanelHeaderContent title={title} action={trailing} />}
    </div>
  )
}
