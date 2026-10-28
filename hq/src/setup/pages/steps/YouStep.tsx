import { useState } from 'react'
import { setPersonName } from 'wasp/client/operations'
import { AuthLayout } from '../../../auth/pages/parts/AuthLayout'
import { FreshHqSide } from '../../../auth/pages/parts/BrandSide'
import { ActionRow, Field, FormError, Heading, PRIMARY, Steps } from '../../../auth/pages/parts/authUi'

type Props = {
  me: { id: string; displayName: string | null; username: string | null }
  onNext: () => void
  position: { step: number; total: number }
}

function Fact({ label, aside, value, note }: { label: string; aside?: string; value: string; note?: string }) {
  return (
    <div className="mb-3.5">
      <div className="mb-1.5 flex justify-between text-small font-medium text-text-muted"><span>{label}</span>{aside && <span className="font-normal">{aside}</span>}</div>
      <div className="text-body text-text-primary">{value}</div>
      {note && <div className="mt-0.5 text-small text-text-muted">{note}</div>}
    </div>
  )
}

/** Setup's first step, seen again: the account made on the first-admin page, with the name editable. */
export function YouStep({ me, onNext, position }: Props) {
  const [name, setName] = useState(me.displayName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function next(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Your name is needed'); return }
    setSaving(true)
    setError('')
    try {
      if (name.trim() !== (me.displayName ?? '')) await setPersonName({ userId: me.id, displayName: name.trim() })
      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save. Try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthLayout setup side={<FreshHqSide />}>
      <Steps step={position.step} total={position.total} name="You" />
      <Heading title="You" lead="The account you created. You're the first person here, so you're the admin. Next you name your organisation." />
      <form onSubmit={next}>
        {error && <FormError>{error}</FormError>}
        <Field id="you-name" label="Your name" aside="shown on your work" autoComplete="name" autoFocus value={name} onChange={e => setName(e.target.value)} />
        <Fact label="Username" aside="how you sign in · can't be changed" value={me.username ?? ''} />
        <Fact label="Password" value="Set" note="Change it any time in Settings › Sign-in" />
        <ActionRow>
          <button type="submit" disabled={saving} className={PRIMARY}>{saving ? 'Saving…' : 'Continue'}</button>
        </ActionRow>
      </form>
    </AuthLayout>
  )
}
