import { useEffect, useId, useRef, useState } from 'react'
import { useAction, startClaudeLogin, completeClaudeLogin, cancelClaudeLogin } from 'wasp/client/operations'

interface Props {
  ownerType: 'org' | 'project' | 'user'
  /** Left out for a person's own subscription, which is always the caller's. */
  ownerId?: string
  /** Called once the login has been saved. */
  onSignedIn?: () => void
}

type Step =
  | { name: 'idle' }
  | { name: 'starting' }
  | { name: 'waiting'; loginId: string; url: string }
  | { name: 'finishing' }

const BUTTON = 'bg-accent hover:bg-accent/90 disabled:opacity-50 text-on-accent px-4 py-2 rounded-lg text-body font-medium transition-colors cursor-pointer'

/**
 * Adding a Claude subscription by signing in on Anthropic's own page. hq
 * shows the sign-in link and passes the short code the person pastes back to
 * the site that is running the login; it never sees a password. Leaving while
 * a login is waiting for its code cancels it so the site can clear it away.
 */
export function ClaudeSignIn({ ownerType, ownerId, onSignedIn }: Props) {
  const start = useAction(startClaudeLogin)
  const complete = useAction(completeClaudeLogin)
  const cancel = useAction(cancelClaudeLogin)
  const [step, setStep] = useState<Step>({ name: 'idle' })
  const [accepted, setAccepted] = useState(false)
  const [code, setCode] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const codeId = useId()
  const shared = ownerType !== 'user'

  // The login the site is holding open for a code, if any; read at unmount.
  const waitingId = useRef<string | null>(null)
  const mounted = useRef(true)
  const cancelRef = useRef(cancel)
  cancelRef.current = cancel

  function release(loginId: string) {
    void Promise.resolve(cancelRef.current({ loginId })).catch(() => undefined)
  }

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (waitingId.current) {
        release(waitingId.current)
        waitingId.current = null
      }
    }
  }, [])

  function fail(err: unknown) {
    setProblem(err instanceof Error ? err.message : String(err))
    setCode('')
    setStep({ name: 'idle' })
  }

  async function begin() {
    setProblem(null)
    setStep({ name: 'starting' })
    try {
      const { loginId, url } = await start({ ownerType, ...(ownerId ? { ownerId } : {}), termsAccepted: accepted })
      if (!mounted.current) {
        release(loginId)
        return
      }
      waitingId.current = loginId
      setStep({ name: 'waiting', loginId, url })
    } catch (err) {
      if (mounted.current) fail(err)
    }
  }

  async function finish(loginId: string) {
    setProblem(null)
    waitingId.current = null
    setStep({ name: 'finishing' })
    try {
      await complete({ loginId, code: code.trim() })
      if (!mounted.current) return
      setCode('')
      setAccepted(false)
      setStep({ name: 'idle' })
      onSignedIn?.()
    } catch (err) {
      if (mounted.current) fail(err)
    }
  }

  function abandon(loginId: string) {
    waitingId.current = null
    release(loginId)
    setCode('')
    setProblem(null)
    setStep({ name: 'idle' })
  }

  return (
    <div className="space-y-3">
      {(step.name === 'idle' || step.name === 'starting') && (
        <>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={e => setAccepted(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span className="text-small text-text-secondary">
              {shared
                ? 'I understand this'
                : 'This subscription is mine, and I understand it will be used only for my own runs.'}
            </span>
          </label>
          <button
            type="button"
            disabled={!accepted || step.name === 'starting'}
            onClick={() => void begin()}
            className={BUTTON}
          >
            {step.name === 'starting' ? 'Starting…' : 'Sign in with Claude'}
          </button>
        </>
      )}

      {step.name === 'waiting' && (
        <div className="space-y-3">
          <p className="text-body text-text-primary">
            <a
              href={step.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline"
            >
              Open Claude to sign in
            </a>
            , then paste the code it gives you here.
          </p>
          <form
            onSubmit={e => {
              e.preventDefault()
              if (code.trim()) void finish(step.loginId)
            }}
            className="space-y-3"
          >
            <label htmlFor={codeId} className="block text-small text-text-secondary">Code from Claude</label>
            <input
              id={codeId}
              type="text"
              value={code}
              onChange={e => setCode(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="w-full bg-surface-2 border border-border rounded-lg px-3 py-2 text-body font-mono text-text-primary focus:outline-none focus:border-accent"
            />
            <div className="flex items-center gap-3">
              <button type="submit" disabled={!code.trim()} className={BUTTON}>
                Finish
              </button>
              <button
                type="button"
                onClick={() => abandon(step.loginId)}
                className="text-body text-text-secondary hover:text-text-primary cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {step.name === 'finishing' && <p className="text-body text-text-muted">Finishing…</p>}

      {problem && <p className="text-small text-danger">{problem}</p>}
    </div>
  )
}
