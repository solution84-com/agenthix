import type { ReactNode } from 'react'
import { AppShell } from './AppShell'
import type { Breadcrumb } from './ScreenBar'

interface AppLayoutProps {
  children: ReactNode
  breadcrumbs?: Breadcrumb[]
  title?: string
  subtitle?: string
  action?: ReactNode
}

export function AppLayout({ children, breadcrumbs, title, subtitle, action }: AppLayoutProps) {
  return (
    <AppShell breadcrumbs={breadcrumbs}>
      {title && (
        <div className="border-b border-border-subtle bg-surface-1 shrink-0 px-4 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="text-h1 leading-8 font-semibold text-text-primary">{title}</h1>
            {subtitle && <p className="text-body text-text-secondary mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
        </div>
      )}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </AppShell>
  )
}
