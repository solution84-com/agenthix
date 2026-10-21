import type { ReactNode } from 'react'
import { AppLayout } from '../../shared/layouts/AppLayout'

/** A page opened from a row of Settings (a phone, connections): Settings stays one step back. */
export function SettingsSubpage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AppLayout breadcrumbs={[{ label: 'Settings', href: '/settings' }, { label: title }]}>
      <div className="px-4 lg:px-10 py-9 max-w-[860px]">{children}</div>
    </AppLayout>
  )
}
