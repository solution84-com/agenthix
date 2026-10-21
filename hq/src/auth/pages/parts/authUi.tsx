import type { InputHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import { AuthLayout } from './AuthLayout'
import type { ShownIdentity } from './orgCard'

export const INPUT = 'auth-input w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-body text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none [&:-webkit-autofill]:[-webkit-text-fill-color:var(--color-text-primary)] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_var(--color-surface-1)]'
export const PRIMARY = 'inline-flex w-full items-center justify-center rounded-lg bg-accent px-4 py-2.5 text-body font-semibold text-on-accent transition-colors hover:bg-accent-hover disabled:bg-surface-3 disabled:text-text-muted'
export const SECONDARY = 'inline-flex items-center justify-center rounded-lg border border-border bg-surface-1 px-4 py-2.5 text-body font-medium text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:opacity-40'
export const TEXT_LINK = 'font-medium text-accent hover:text-accent-hover'

export function Field({ label, aside, id, ...input }: { label: string; aside?: string } & InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  return (
    <div className="mb-3.5">
      <label htmlFor={id} className="mb-1.5 flex justify-between text-small font-medium text-text-muted">
        <span>{label}</span>{aside && <span className="font-normal">{aside}</span>}
      </label>
      <input id={id} className={INPUT} {...input} />
    </div>
  )
}

export function Heading({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-h1 font-semibold text-text-primary">{title}</h1>
      {lead && <p className="mt-1 text-body text-text-secondary">{lead}</p>}
    </div>
  )
}

export function FormError({ children }: { children: ReactNode }) {
  return <p role="alert" className="mb-3.5 rounded-lg border border-danger/40 px-3 py-2 text-small text-danger">{children}</p>
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
