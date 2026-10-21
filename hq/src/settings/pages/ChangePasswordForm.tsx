import { useState, type FormEvent } from 'react'
import { api, handleApiError } from 'wasp/client/api'
import { Button, FormField, Input } from '@agenthix/ui/primitives'

type Fields = { currentPassword: string; newPassword: string; newPasswordAgain: string }
const EMPTY: Fields = { currentPassword: '', newPassword: '', newPasswordAgain: '' }

/** The refusal hq answered with, in its words. */
function refusal(err: unknown): string {
  const e = handleApiError(err) as { message?: string; data?: { error?: string } }
  return e.data?.error ?? e.message ?? 'Your password was not changed'
}

/** Settings › Sign-in: the person's own password, changed after typing the current one. */
export function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [fields, setFields] = useState<Fields>(EMPTY)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields(f => ({ ...f, [key]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setProblem(null)
    if (fields.newPassword !== fields.newPasswordAgain) {
      setProblem('The new password and its repeat are not the same')
      return
    }
    setBusy(true)
    try {
      await api.post('api/auth/change-password', { json: fields }).json()
      setFields(EMPTY)
      onDone()
    } catch (err) {
      setProblem(refusal(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-sm" aria-label="Change your password">
      <FormField label="Current password" htmlFor="current-password">
        <Input id="current-password" type="password" autoComplete="current-password" value={fields.currentPassword} onChange={set('currentPassword')} required />
      </FormField>
      <FormField label="New password" htmlFor="new-password" hint="At least 8 characters.">
        <Input id="new-password" type="password" autoComplete="new-password" value={fields.newPassword} onChange={set('newPassword')} required />
      </FormField>
      <FormField label="New password again" htmlFor="new-password-again">
        <Input id="new-password-again" type="password" autoComplete="new-password" value={fields.newPasswordAgain} onChange={set('newPasswordAgain')} required />
      </FormField>
      {problem && <p role="alert" className="text-small text-danger">{problem}</p>}
      <p className="text-small text-text-muted">Your other devices are signed out. Connections for outside tools keep working; revoke them under Devices and connections.</p>
      <Button type="submit" disabled={busy}>{busy ? 'Changing…' : 'Change password'}</Button>
    </form>
  )
}
