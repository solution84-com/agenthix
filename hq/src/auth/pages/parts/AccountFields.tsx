import { useState } from 'react'
import { Field, PRIMARY } from './authUi'
import { ShowAttention } from '@agenthix/ui/attention'

export type AccountForm = { name: string; username: string; password: string }

/**
 * The account an invitation link makes — name, username, password — for both
 * first steps: setup's (the first admin) and onboarding's Join. The caller
 * says what the button reads and does with the three values.
 */
export function AccountFields({ submitLabel, busyLabel, busy, error, onSubmit }: {
  submitLabel: string
  busyLabel: string
  busy: boolean
  error: string
  onSubmit: (form: AccountForm) => void
}) {
  const [form, setForm] = useState<AccountForm>({ name: '', username: '', password: '' })
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(form) }}>
      <ShowAttention kind="alert" text={error} title="The account was not made" />
      <Field id="name" label="Your name" aside="shown on your work" placeholder="Dana Ruiz" autoComplete="name" autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
      <Field id="username" label="Username" aside="how you sign in" autoComplete="username" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
      <Field id="password" label="Password" aside="at least 8 characters" type="password" autoComplete="new-password" minLength={8} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
      <button type="submit" disabled={busy} className={`${PRIMARY} mt-1.5`}>{busy ? busyLabel : submitLabel}</button>
    </form>
  )
}
