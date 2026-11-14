import { Outlet } from 'react-router'
import { FailureServer } from '@agenthix/ui/attention'
import '@fontsource-variable/inter'
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
    <FailureServer name="HQ">
      <VoiceCallProvider>
        <NavDrawerProvider>
          <ActiveNavProvider>
            <RootShell dataRouter>
              <Outlet />
            </RootShell>
          </ActiveNavProvider>
        </NavDrawerProvider>
      </VoiceCallProvider>
    </FailureServer>
  )
}
