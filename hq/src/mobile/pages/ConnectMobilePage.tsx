import { useEffect, useState, useCallback, useRef } from 'react'
import QRCodeImport from 'react-qr-code'
import { generateMobileAuthToken } from 'wasp/client/operations'
import { SettingsSubpage } from '../../settings/pages/SettingsSubpage'
import { BRANDING } from '@agenthix/core'
import { copyText, COPY_FAILED_WORDS } from '../../shared/copyText'
import { SignedInPhones } from './SignedInPhones'
import { Button, FOCUS_RING } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'

// react-qr-code is CommonJS: once bundled, its default import can arrive as the module rather than the
// component, which crashes the page ("Element type is invalid").
const QRCode = (QRCodeImport as unknown as { default?: typeof QRCodeImport }).default ?? QRCodeImport

const TTL_SECONDS = 300

export function ConnectMobilePage() {
  const [token, setToken] = useState<string | null>(null)
  const [timeLeft, setTimeLeft] = useState(TTL_SECONDS)
  const [expired, setExpired] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    setExpired(false)
    try {
      const { token: t } = await generateMobileAuthToken()
      setToken(t)
      setTimeLeft(TTL_SECONDS)
    } catch {
      setError('Could not generate QR code. Please try again.')
    } finally {
      setGenerating(false)
    }
  }, [])

  // Countdown — stops at 0, marks expired, does NOT auto-refresh
  useEffect(() => {
    if (!token || expired) return
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setExpired(true)
          return 0
        }
        return t - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [token, expired])

  const clientBase = import.meta.env.REACT_APP_CLIENT_URL || window.location.origin
  const qrValue = token ? `${clientBase}/mobile-connect?token=${token}` : ''

  const timerColor =
    timeLeft <= 15
      ? 'var(--color-danger)'
      : timeLeft <= 30
        ? 'var(--color-warning)'
        : 'var(--color-success)'

  const [copied, setCopied] = useState<boolean | 'failed'>(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function copyUrl() {
    const ok = await copyText(qrValue)
    setCopied(ok ? true : 'failed')
    if (copyTimer.current) clearTimeout(copyTimer.current)
    if (ok) copyTimer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <SettingsSubpage title="Phone">
      <div>
        <h1 className="text-h1 font-medium text-text-primary mb-1">Connect Mobile App</h1>
        <p className="text-body text-text-secondary mb-8">
          Open the {BRANDING.displayName} mobile app, tap <strong>Scan QR Code</strong> on the Connect screen, and point it at this code. You'll be signed in automatically.
        </p>

<ShowAttention kind="alert" text={error} title="The QR code was not made" onClose={() => setError(null)} />

        {!token && !generating && !error && (
          <div className="flex flex-col items-center gap-4 py-10">
            <p className="text-body text-text-secondary">Generate a QR code when you're ready to connect.</p>
            <Button
              onClick={generate}
            >
              Generate QR Code
            </Button>
          </div>
        )}

        {generating && !token && (
          <div className="flex items-center justify-center h-[200px]">
            <div className="text-body text-text-muted">Generating…</div>
          </div>
        )}

        {token && (
          <div className="flex flex-col items-center gap-6">
            {!expired && (
              <div className="p-4 bg-on-accent rounded-xl shadow-sm border border-border">
                <QRCode value={qrValue} size={200} />
              </div>
            )}

            {expired ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-body text-text-secondary">This code has expired.</p>
                <Button
                  onClick={generate}
                  disabled={generating}
                >
                  {generating ? 'Generating…' : 'Generate New Code'}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-body">
                  <span className="text-text-secondary">Expires in</span>
                  <span className="font-mono font-medium" style={{ color: timerColor }}>
                    {timeLeft}s
                  </span>
                </div>

                <div className="w-full">
                  <p className="text-small text-text-muted mb-1.5">Or copy the link manually</p>
                  <div className="flex items-center gap-2 bg-field border border-field-border rounded-lg px-3 py-2">
                    <span className="flex-1 text-small font-mono text-text-secondary truncate">{qrValue}</span>
                    <button
                      onClick={() => void copyUrl()}
                      className={`rounded flex-shrink-0 text-small text-link hover:underline ${FOCUS_RING}`}
                    >
                      {copied === true ? 'Copied!' : 'Copy'}
                    </button>
                    <ShowAttention kind="alert" text={copied === 'failed' ? COPY_FAILED_WORDS : null} title="The link was not copied" onClose={() => setCopied(false)} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div className="mt-10 pt-8 border-t border-border-subtle">
          <p className="text-small text-text-muted leading-relaxed">
            Each code is valid for 5 minutes and can only be used once. A new session is created on your device — signing out on one device won't affect the other.
          </p>
        </div>

        <SignedInPhones />
      </div>
    </SettingsSubpage>
  )
}
