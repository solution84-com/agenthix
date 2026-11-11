import type { ReactNode } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { AppShell } from '../../../../shared/layouts/AppShell'
import { FormTopBar } from '../../../../shared/layouts/TopBar'
import { placeNavOf } from '../../../../places/placeNav'
import type { useProjectPlace } from '../../../place/useProjectPlace'
import { settingsTabHref } from '../SettingsTabs'

const SETTINGS_SECTION = 'settings'

export type FormSubmit = { label: string; onClick: () => void; disabled?: boolean; why?: string }

/**
 * A page of Settings › Task types (a type's columns, New task type, Publish as task template): inside the project, its
 * navigation beside it, the breadcrumb ending at the page. On a wide screen the page's head has its title, the line
 * under it, Cancel and the one filled button; on a phone it is a form: ✕, the title and that button in the top bar.
 */
export function SettingsFormFrame({ projectKey, place, projectName, title, under, crumb, onCancel, submit, children }: {
  projectKey: string
  place: ReturnType<typeof useProjectPlace>['place']
  projectName?: string
  title: string
  under?: string
  /** The breadcrumb's last part, when it differs from the title. */
  crumb?: string
  onCancel: () => void
  submit: FormSubmit | null
  children: ReactNode
}) {
  const types = settingsTabHref(projectKey, 'types')
  const breadcrumbs = [
    { label: 'Projects', href: '/projects' },
    ...(projectName ? [{ label: projectName, href: place?.homePath, list: 'projects' as const }] : []),
    { label: 'Settings', href: settingsTabHref(projectKey, 'general') },
    { label: 'Task types', href: types },
    { label: crumb ?? title },
  ]
  return (
    <AppShell
      breadcrumbs={breadcrumbs}
      placeNav={place ? placeNavOf(place, SETTINGS_SECTION) : null}
      mobileHeader={<FormTopBar title={title} under={[projectName, 'Task types'].filter(Boolean).join(' · ')} onCancel={onCancel} submit={submit ?? { label: 'Save', disabled: true }} />}
    >
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="px-6 py-6 max-lg:px-3 max-lg:py-4">
          <div className="flex items-start gap-3 max-lg:hidden">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-h2 font-medium text-text-primary">{title}</h1>
              {under && <p className="text-small text-text-muted">{under}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="secondary" onClick={onCancel}>Cancel</Button>
              {submit && <Button onClick={submit.onClick} disabled={submit.disabled} title={submit.why}>{submit.label}</Button>}
            </div>
          </div>
          {under && <p className="text-micro text-text-muted lg:hidden">{under}</p>}
          <div className="mt-4 border-t border-border-subtle pt-4 max-lg:mt-3">{children}</div>
        </div>
      </main>
    </AppShell>
  )
}
