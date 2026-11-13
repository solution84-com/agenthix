/**
 * The Fleet Console's frame (board *The shell*): the menu on the left — Dashboard and HQ, every site, the jobs and the
 * person signed in; the page beside it, on a soft wash, with the notices opening over it beside the menu and *Plan
 * maintenance* at its right; and the *Local only* foot across the bottom. There is no breadcrumb trail: HQ and each site are reached from the menu.
 */
import type { ReactNode } from 'react'
import { ToastHost } from '@agenthix/ui/attention'
import { useAuth, useSignedInUser } from '../auth/AuthContext'
import { useFleet } from '../pages/dashboard/useFleet'
import { LocalOnlyFoot } from './LocalOnlyFoot'
import { MaintenancePanelHost } from './MaintenancePanelHost'
import { jobsFor, menuHq, menuSites } from './menu'
import { useFeature } from '../features/features'
import { useFleetNotices } from './notices'
import { NoticesPanel } from './NoticesPanel'
import { Sidebar } from './Sidebar'
import { useShellPanel } from './useShellPanel'

export function Shell({ path, machineName, children }: { path: string; machineName: string | null; children: ReactNode }) {
  const notices = useFleetNotices()
  const fleetState = useFleet()
  const fleet = fleetState.phase === 'loading' ? null : fleetState.fleet
  const now = fleetState.phase === 'ready' ? fleetState.readAt : new Date()
  const user = useSignedInUser()
  const { signOut } = useAuth()
  const panel = useShellPanel()
  const cloudOn = useFeature('cloud')
  return (
    <div className="flex h-screen flex-col">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          jobs={jobsFor(cloudOn)}
          hq={menuHq(fleet)}
          sites={fleet ? menuSites(fleet.hosts, now) : []}
          path={path}
          machineName={machineName}
          noticeCount={notices.length}
          user={user}
          onSignOut={() => void signOut()}
        />
        <div className="relative flex min-w-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto bg-surface-0 bg-[radial-gradient(520px_190px_at_26%_-70px,var(--color-frame-glow),transparent_70%),linear-gradient(180deg,var(--color-frame-wash),transparent_200px)] bg-no-repeat px-7 pt-6 pb-7">
            {children}
          </main>
          {panel.open === 'notices' && (
            <>
              {/* A click anywhere on the page beside the panel closes it, and does nothing else. */}
              <div aria-hidden data-testid="panel-outside" className="absolute inset-0 z-20 hidden lg:block" onClick={panel.close} />
              <div className="fixed inset-0 z-30 bg-surface-1 lg:absolute lg:inset-y-0 lg:right-auto lg:left-0 lg:w-[380px] lg:border-r lg:border-border lg:shadow-pop">
                <NoticesPanel notices={notices} />
              </div>
            </>
          )}
          <MaintenancePanelHost />
        </div>
      </div>
      <LocalOnlyFoot />
      {/* Above the *Local only* foot. */}
      <ToastHost offset="2.5rem" />
    </div>
  )
}
