import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { PanelHeaderContent, PANEL_HEADER_ROW } from '@agenthix/ui/primitives'
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
      className="flex h-6 w-6 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
    >
      <X size={14} />
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
