import type { InputHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import { AuthLayout } from './AuthLayout'
import type { ShownIdentity } from './orgCard'
import { BUTTON_PRIMARY, BUTTON_SECONDARY, FIELD, FOCUS_RING } from '@agenthix/ui/primitives'

export const INPUT = `auth-input w-full rounded-lg ${FIELD} px-3 py-2 text-body [&:-webkit-autofill]:[-webkit-text-fill-color:var(--color-text-primary)] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_var(--color-field)]`
export const PRIMARY = `inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-body font-medium ${BUTTON_PRIMARY}`
export const SECONDARY = `inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-body font-medium ${BUTTON_SECONDARY}`
export const TEXT_LINK = `rounded font-medium text-link hover:underline ${FOCUS_RING}`

export function Field({ label, aside, id, error, ...input }: { label: string; aside?: string; error?: string } & InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  return (
    <div className="mb-3.5">
      <label htmlFor={id} className="mb-1.5 flex justify-between text-small font-medium text-text-muted">
        <span>{label}</span>{aside && <span className="font-normal">{aside}</span>}
      </label>
      <input id={id} className={INPUT} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...input} />
      {error && <p id={`${id}-error`} className="mt-1 text-small text-danger">{error}</p>}
    </div>
  )
}

export function Heading({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-h1 font-medium text-text-primary">{title}</h1>
      {lead && <p className="mt-1 text-body text-text-secondary">{lead}</p>}
    </div>
  )
}

/**
 * A setup or onboarding screen's buttons: right under the form when it fits the window, pinned to the window's foot
 * while the form is longer, so the way on is always in reach. Main.css keeps a focused field clear of it.
 */
export function ActionRow({ children }: { children: ReactNode }) {
  return (
    <div data-action-row className="sticky bottom-0 z-10 -mx-5 mt-5 flex items-center gap-2 border-t border-border-subtle bg-surface-1/90 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      {children}
    </div>
  )
}

/** A line saying how something stands, outlined in the colour of what it says. */
export function StateLine({ tone = 'plain', children }: { tone?: 'ok' | 'warn' | 'plain'; children: ReactNode }) {
  const outline = tone === 'ok' ? 'border-success/50' : tone === 'warn' ? 'border-warning/60' : 'border-border-subtle'
  const dot = tone === 'ok' ? 'bg-success' : tone === 'warn' ? 'bg-warning' : 'bg-text-muted'
  return (
    <div className={`mt-3 flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-small text-text-secondary ${outline}`}>
      <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div>{children}</div>
    </div>
  )
}

/**
 * The progress of setup (four steps), or of a shorter flow when `total` says so.
 * `name` follows the count ("Step 2 of 3 · You"); a `lastLook` fills the bar and
 * reads "Last look", since that screen is not one of the counted steps.
 */
export function Steps({ step, total = 4, name, lastLook }: { step: number; total?: number; name?: string; lastLook?: boolean }) {
  const filled = lastLook ? total : step
  return (
    <div className="mb-5">
      <div className="flex gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, k) => k + 1).map(i => <span key={i} className={`h-1 flex-1 rounded-full ${i <= filled ? 'bg-accent' : 'bg-surface-3'}`} />)}
      </div>
      <div className="mt-1.5 text-small text-text-muted">{lastLook ? 'Last look' : `Step ${step} of ${total}`}{name && !lastLook ? ` · ${name}` : ''}</div>
    </div>
  )
}

/**
 * A way in that cannot go on (getting-in spec, When something is not right):
 * the organisation's identity, one plain sentence of what happened, and one way
 * forward.
 */
export function ProblemScreen({ identity, title, children, actions }: { identity: ShownIdentity | null; title: string; children?: ReactNode; actions: ReactNode }) {
  return (
    <AuthLayout identity={identity}>
      <Heading title={title} lead={children} />
      <div className="flex flex-wrap gap-2">{actions}</div>
    </AuthLayout>
  )
}

export function SignInInstead({ primary = false }: { primary?: boolean }) {
  return <Link to="/login" className={primary ? `${PRIMARY} w-auto` : SECONDARY}>Sign in{primary ? '' : ' instead'}</Link>
}
