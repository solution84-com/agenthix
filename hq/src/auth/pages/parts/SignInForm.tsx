import { Field, FormError, Heading, PRIMARY, TEXT_LINK } from './authUi'
import { hqOf } from './orgCard'

type Values = { username: string; password: string; rememberMe: boolean }

/**
 * The sign-in form. The real page and setup's preview both draw it from here, so
 * they cannot drift; `inert` makes it a picture (nothing focusable, nothing sent).
 */
export function SignInForm({ org, values, error, busy, inert, onChange, onSubmit, onForgot }: {
  org: string | null
  values: Values
  error?: string
  busy?: boolean
  inert?: boolean
  onChange?: (next: Partial<Values>) => void
  onSubmit?: (e: React.FormEvent) => void
  onForgot?: () => void
}) {
  const idp = inert ? 'preview-' : ''
  const off = inert ? { tabIndex: -1, readOnly: true } : {}
  return (
    <form onSubmit={onSubmit}>
      <Heading title="Sign in" lead={`to ${hqOf(org)}`} />
      {error && <FormError>{error}</FormError>}
      <Field id={`${idp}username`} label="Username" autoComplete="username" autoFocus={!inert} value={values.username} onChange={e => onChange?.({ username: e.target.value })} required={!inert} {...off} />
      <Field id={`${idp}password`} label="Password" type="password" autoComplete="current-password" value={values.password} onChange={e => onChange?.({ password: e.target.value })} required={!inert} {...off} />
      <div className="mb-4 flex items-center justify-between text-small">
        <label className="flex cursor-pointer select-none items-center gap-2 text-text-muted">
          <input type="checkbox" checked={values.rememberMe} onChange={e => onChange?.({ rememberMe: e.target.checked })} className="h-3.5 w-3.5 cursor-pointer accent-accent" {...off} />
          Remember my username
        </label>
        <button type="button" onClick={onForgot} className={TEXT_LINK} tabIndex={inert ? -1 : undefined}>Forgot your password?</button>
      </div>
      <button type="submit" disabled={busy} className={PRIMARY} tabIndex={inert ? -1 : undefined}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p className="mt-4 text-center text-small text-text-muted">New here? Ask an admin of {org ?? 'your organisation'} for an invitation.</p>
    </form>
  )
}
