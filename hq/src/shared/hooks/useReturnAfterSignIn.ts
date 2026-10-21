import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { isWayIn, rememberReturnPath, takeReturnPath } from '../returnAfterSignIn'

/**
 * Someone not signed in who opens a page is sent to sign in by Wasp; that page
 * is remembered here, in the same render, before the address changes. Once
 * they are signed in and Wasp has moved them off the sign-in page, they are
 * sent back to it.
 *
 * Waits until they have left `/login`, because Wasp's own sign-in navigates
 * to `/` after it succeeds and would overwrite a navigation made before it.
 */
export function useReturnAfterSignIn(): void {
  const { data: user, status } = useAuth()
  const { pathname, search, hash } = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (status !== 'success' || user || pathname === '/' || isWayIn(pathname)) return
    rememberReturnPath(`${pathname}${search}${hash}`, window.sessionStorage)
  }, [status, user, pathname, search, hash])

  useEffect(() => {
    if (!user || pathname === '/login') return
    const back = takeReturnPath(window.sessionStorage)
    if (back && back !== pathname) navigate(back, { replace: true })
  }, [user, pathname, navigate])
}
