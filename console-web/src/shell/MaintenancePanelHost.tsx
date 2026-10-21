import { PlanMaintenancePanel } from '../pages/maintenance/PlanMaintenancePanel'
import { useShellPanel } from './useShellPanel'

/**
 * *Plan maintenance* at the right of the page, over it, while the address says so (`?panel=maintenance`); the page
 * stays in view beside it, and a click on it closes the panel and does nothing else. On a small screen it fills it.
 */
export function MaintenancePanelHost({ pollMs }: { pollMs?: number }) {
  const panel = useShellPanel()
  if (panel.open !== 'maintenance') return null
  return (
    <>
      <div aria-hidden data-testid="maintenance-outside" className="absolute inset-0 z-20 hidden bg-scrim/30 lg:block" onClick={panel.close} />
      <div className="fixed inset-0 z-30 bg-surface-1 lg:absolute lg:inset-y-0 lg:right-0 lg:left-auto lg:w-[440px] lg:border-l lg:border-border lg:shadow-pop">
        <PlanMaintenancePanel pollMs={pollMs} />
      </div>
    </>
  )
}
