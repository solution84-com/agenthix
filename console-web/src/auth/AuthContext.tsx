/**
 * Who is signed in on this tab. Checked once when the app opens — a new tab takes the token from an open one
 * (api/tokenShare.ts); any request that finds the session gone
 * (api/client.ts) returns the app to the sign-in page, with a word on why when the server gave one.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { onSignedOut } from '../api/client'
import { currentSession, signOut as endSession, type SessionUser } from '../api/session'
import { shareSession } from '../api/tokenShare'

export type AuthState =
  | { phase: 'checking' }
  | { phase: 'signedOut'; notice?: string }
  | { phase: 'signedIn'; user: SessionUser }

interface Auth {
  state: AuthState
  signedIn: (user: SessionUser) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<Auth | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ phase: 'checking' })

  useEffect(() => {
    let live = true
    currentSession()
      .then(user => { if (live) setState(user ? { phase: 'signedIn', user } : { phase: 'signedOut' }) })
      .catch(() => { if (live) setState({ phase: 'signedOut' }) })
    const stop = onSignedOut(({ code, message }) => {
      setState({ phase: 'signedOut', notice: code === 'signed_out' ? 'Your session has ended. Sign in again.' : message })
    })
    // Answers a new tab with this tab's token; another tab signing out ends the session here too.
    const stopSharing = shareSession(() => {
      setState(s => (s.phase === 'signedOut' ? s : { phase: 'signedOut', notice: 'You signed out in another tab.' }))
    })
    return () => { live = false; stop(); stopSharing() }
  }, [])

  const signedIn = useCallback((user: SessionUser) => setState({ phase: 'signedIn', user }), [])
  const signOut = useCallback(async () => {
    try {
      await endSession()
    } finally {
      setState({ phase: 'signedOut' })
    }
  }, [])

  const value = useMemo(() => ({ state, signedIn, signOut }), [state, signedIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth needs an AuthProvider')
  return auth
}

/** The person signed in; only for what the shell draws, where someone always is. */
export function useSignedInUser(): SessionUser {
  const { state } = useAuth()
  if (state.phase !== 'signedIn') throw new Error('useSignedInUser outside a session')
  return state.user
}
