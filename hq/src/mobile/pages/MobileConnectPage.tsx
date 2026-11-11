import { useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { exchangeMobileAuthToken } from 'wasp/client/operations'
import { ReadFailure, isFinal, retryRead } from '@agenthix/ui/attention'

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (msg: string) => void }
  }
}

type Status = 'loading' | 'success' | 'error'
// `unreachable`: HQ did not answer through the retries, so the code may still be good: Try again.
type ErrorReason = 'expired' | 'used' | 'invalid' | 'unreachable'

export function MobileConnectPage() {
  const location = useLocation()
  const token = new URLSearchParams(location.search).get('token')
  const [status, setStatus] = useState<Status>('loading')
  const [reason, setReason] = useState<ErrorReason>('invalid')

  const exchange = useCallback(() => {
    if (!token) {
      setReason('invalid')
      setStatus('error')
      return
    }
    setStatus('loading')
    retryRead(() => exchangeMobileAuthToken({ token }))
      .then(({ sessionId }) => {
        localStorage.setItem('wasp:sessionId', JSON.stringify(sessionId))
        window.ReactNativeWebView?.postMessage(
          JSON.stringify({ type: 'AUTH_TOKEN', token: sessionId })
        )
        setStatus('success')
      })
      .catch((err: { statusCode?: number }) => {
        if (err.statusCode === 400) {
          const msg = String(err).toLowerCase()
          setReason(msg.includes('expired') ? 'expired' : 'used')
        } else {
          setReason(isFinal(err) ? 'invalid' : 'unreachable')
        }
        setStatus('error')
      })
  }, [token])
  useEffect(exchange, [exchange])

  const errorMessages: Record<ErrorReason, string> = {
    expired: 'This QR code has expired. Go back to Settings › Devices and connections › Phone and scan the new code.',
    used: 'This QR code has already been used. Generate a new one from Settings › Devices and connections › Phone.',
    invalid: 'Invalid QR code. Make sure you scanned the code from Settings › Devices and connections › Phone.',
    unreachable: '',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      {status === 'loading' && (
        <>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
          <p style={{ fontSize: 16, color: 'var(--color-text-secondary)' }}>Connecting your mobile app…</p>
        </>
      )}
      {status === 'success' && (
        <>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <p style={{ fontSize: 18, fontWeight: 600 }}>Connected!</p>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', marginTop: 8 }}>You can close this window.</p>
        </>
      )}
      {status === 'error' && (reason === 'unreachable'
        ? <ReadFailure what="The connection" retry={exchange} />
        : <ReadFailure what="The connection" final={errorMessages[reason]} />)}
    </div>
  )
}
