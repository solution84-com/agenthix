import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { useAuth } from 'wasp/client/auth'
import { openPreview } from 'wasp/client/operations'
import { rememberReturnPath } from '../shared/returnAfterSignIn'

/**
 * Where a preview host sends a browser that has no cookie for it yet
 * (adr-0071). It asks hq for a one-time ticket and moves straight on to the
 * preview's own host, so someone already signed in only sees it for a moment.
 *
 * It sends an unsigned person to sign in itself rather than being declared
 * authRequired, because Wasp's own redirect forgets where the person was:
 * this remembers its path first, and the app shell brings them back here after
 * sign-in so the check runs and the preview opens.
 */
export function OpenPreviewPage() {
  const { previewId = '' } = useParams()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { data: user, isLoading } = useAuth()
  const [error, setError] = useState<string | null>(null)
  // One ticket per visit, not one per render pass in development.
  const asked = useRef(false)

  useEffect(() => {
    if (isLoading) return
    if (!user) {
      rememberReturnPath(pathname, window.sessionStorage)
      navigate('/login', { replace: true })
      return
    }
    if (asked.current) return
    asked.current = true
    openPreview({ previewId })
      .then(({ url }) => window.location.replace(url))
      .catch((e: unknown) => setError(e instanceof Error && e.message ? e.message : 'This preview could not be opened.'))
  }, [isLoading, user, pathname, previewId, navigate])

  return (
    <div className="min-h-screen bg-surface-0 flex items-center justify-center p-4">
      <p className={error ? 'text-body text-danger' : 'text-body text-text-secondary'}>
        {error ?? 'Opening the preview…'}
      </p>
    </div>
  )
}
