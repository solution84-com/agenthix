import { lazy, Suspense, useEffect } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { useConsoleStatus } from './auth/useConsoleStatus'
import { ActivityPage } from './pages/activity/ActivityPage'
import { AddSitePage } from './pages/add/AddSitePage'
import { RestorePage } from './pages/add/RestorePage'
import { FleetAdminsPage } from './pages/fleet-admins/FleetAdminsPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { HqRoute } from './pages/hq/HqRoute'
import { maintenanceAndBackupsScreen } from './pages/maintenance/routes'
import { SitePage } from './pages/site/SitePage'
import { AuthenticatorSetupPage } from './pages/remote-access/AuthenticatorSetupPage'
import { RemoteAccessPage } from './pages/remote-access/RemoteAccessPage'
import { CloudSitePage } from './cloud/CloudSitePage'
import { ComesLaterPage } from './pages/ComesLaterPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SignInPage } from './pages/SignInPage'
import { YourAccountPage } from './pages/YourAccountPage'
import { HelpPage } from './pages/help/HelpPage'
import { navigate, usePath } from './router'
import { HOME, JOBS, sitePath } from './shell/menu'
import { Shell } from './shell/Shell'
import { FeaturesProvider } from './features/features'

// The page of every component in both themes, for checking against the boards: development builds only.
const ComponentsPage = import.meta.env.DEV ? lazy(() => import('./dev/ComponentsPage')) : null

export function App() {
  const path = usePath()
  if (ComponentsPage && path === '/_components') {
    return <Suspense fallback={null}><ComponentsPage /></Suspense>
  }
  return <AuthProvider><Screens path={path} /></AuthProvider>
}

function Screens({ path }: { path: string }) {
  const { state } = useAuth()
  const status = useConsoleStatus()

  // The dashboard was once called Fleet, at /fleet, and a site's page was at /fleet/<fingerprint>.
  useEffect(() => {
    if (path === '/fleet') navigate(HOME, { replace: true })
    const old = OLD_SITE.exec(path)
    if (old) navigate(`${sitePath(old[1])}${old[2] ?? ''}${window.location.search}`, { replace: true })
  }, [path])

  if (state.phase === 'checking') return null
  if (state.phase === 'signedOut') return <SignInPage status={status} />
  return (
    <FeaturesProvider>
      <Shell path={path} machineName={status.phase === 'ready' ? status.status.machineName : null}>
        <ErrorBoundary key={path}><Page path={path} /></ErrorBoundary>
      </Shell>
    </FeaturesProvider>
  )
}

const OLD_SITE = /^\/fleet\/(?!add(?:\/|$)|cloud(?:\/|$))([^/]+)(\/[^/]+)?$/

const SITE_ACTIONS: Record<string, string> = {
  logs: 'Logs',
}

/** A name from the address, or null when its escapes are malformed. */
function decodeName(part: string): string | null {
  try {
    return decodeURIComponent(part)
  } catch {
    return null
  }
}

/** The screen for a path. Each menu item's screen is its own lane's (plan 4.4–4.14); until it lands it comes later. */
function Page({ path }: { path: string }) {
  if (path === '/account') return <YourAccountPage />
  const maintenanceOrBackups = maintenanceAndBackupsScreen(path, window.location.search)
  if (maintenanceOrBackups) return maintenanceOrBackups
  if (path === HOME) return <DashboardPage />
  if (path === '/help') return <HelpPage />
  if (path === '/activity') return <ActivityPage />
  if (path === '/fleet-admins') return <FleetAdminsPage />
  if (path === '/fleet/add') return <AddSitePage />
  if (path === '/fleet/add/restore') return <RestorePage />
  if (path === '/remote-access') return <RemoteAccessPage />
  if (path === '/account/code') return <AuthenticatorSetupPage />
  const cloudSite = /^\/fleet\/cloud\/([^/]+)$/.exec(path)
  if (cloudSite || path.startsWith('/fleet/cloud/')) {
    const name = cloudSite ? decodeName(cloudSite[1]) : null
    return name === null ? <NotFoundPage /> : <CloudSitePage name={name} />
  }
  const hq = /^\/hq(?:\/([^/]+))?$/.exec(path)
  if (hq) return <HqRoute part={hq[1] ?? null} />
  const site = /^\/sites\/([^/]+)(?:\/([^/]+))?$/.exec(path)
  if (site) {
    const [, fingerprint, part] = site
    if (!part) return <SitePage fingerprint={fingerprint} />
    return <ComesLaterPage title={SITE_ACTIONS[part] ?? 'A site'} />
  }
  if (OLD_SITE.test(path)) return null
  const item = JOBS.find(i => path === i.path || path.startsWith(`${i.path}/`))
  if (item) return <ComesLaterPage title={item.label} />
  if (path === '/fleet') return null
  return <NotFoundPage />
}
