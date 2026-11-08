import type { ReactNode } from 'react'
import { AppShell } from './AppShell'
import type { Breadcrumb } from './ScreenBar'
import { usePhoneActions, type PhoneAction } from './phoneActions'

interface AppLayoutProps {
  children: ReactNode
  breadcrumbs?: Breadcrumb[]
  title?: string
  subtitle?: string
  action?: ReactNode
  /** The page's actions on a phone, behind the top bar's ⋯ (the main one first); `action` is then drawn from `lg` up. */
  phoneActions?: PhoneAction[]
  /** Below `lg`, in place of the standard top bar (☰ and the title): a sub-page's, with ‹ Back. */
  mobileHeader?: ReactNode
}

export function AppLayout({ children, breadcrumbs, title, subtitle, action, phoneActions, mobileHeader }: AppLayoutProps) {
  return (
    <AppShell breadcrumbs={breadcrumbs} mobileHeader={mobileHeader}>
      <AppLayoutBody title={title} subtitle={subtitle} action={action} phoneActions={phoneActions}>{children}</AppLayoutBody>
    </AppShell>
  )
}

// Inside the shell, so the actions reach the frame's top bar whether the root draws the frame or the page does.
function AppLayoutBody({ children, title, subtitle, action, phoneActions }: Omit<AppLayoutProps, 'breadcrumbs' | 'mobileHeader'>) {
  const onPhone = usePhoneActions(phoneActions) && !!phoneActions?.length
  return (
    <>
      {title && (
        <div className="border-b border-border-subtle bg-surface-1 shrink-0 px-4 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-64">
            <h1 className="text-h1 leading-8 font-semibold text-text-primary">{title}</h1>
            {subtitle && <p className="text-body text-text-secondary mt-0.5">{subtitle}</p>}
          </div>
          {action && <div className={`flex shrink-0 flex-wrap items-center gap-2 ${onPhone ? 'max-lg:hidden' : ''}`}>{action}</div>}
        </div>
      )}
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </>
  )
}
