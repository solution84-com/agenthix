import { Outlet } from 'react-router'
import './Main.css'
import { VoiceCallProvider } from './shared/providers/VoiceCallProvider'
import { NavDrawerProvider } from './shared/context/NavDrawerContext'
import { ActiveNavProvider } from './shared/context/ActiveNavContext'
import { RootShell } from './shared/layouts/RootShell'
import { useReturnAfterSignIn } from './shared/hooks/useReturnAfterSignIn'
import { useSyncBrowserTimezone } from './shared/hooks/useSyncBrowserTimezone'

export function App() {
  useReturnAfterSignIn()
  useSyncBrowserTimezone()
  return (
    <VoiceCallProvider>
      <NavDrawerProvider>
        <ActiveNavProvider>
          <RootShell dataRouter>
            <Outlet />
          </RootShell>
        </ActiveNavProvider>
      </NavDrawerProvider>
    </VoiceCallProvider>
  )
}
