import { AppLayout } from '../../shared/layouts/AppLayout'
import type { Breadcrumb } from '../../shared/layouts/ScreenBar'

/** A Chat screen while the person and their space load. */
export function ChatLoading({ breadcrumbs }: { breadcrumbs: Breadcrumb[] }) {
  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <div className="flex h-full items-center justify-center">
        <span className="text-body text-text-muted">Loading…</span>
      </div>
    </AppLayout>
  )
}
