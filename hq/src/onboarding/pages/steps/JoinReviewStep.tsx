import { useState } from 'react'
import { setPersonName } from 'wasp/client/operations'
import { Field, Heading } from '../../../auth/pages/parts/authUi'
import type { OnboardingData } from '../../queries'
import { OnboardingFrame, StepButtons } from './OnboardingFrame'
import { ShowAttention } from '@agenthix/ui/attention'

function Fact({ label, aside, value, note }: { label: string; aside?: string; value: string; note?: string }) {
  return (
    <div className="mb-3.5">
      <div className="mb-1.5 flex justify-between text-small font-medium text-text-muted"><span>{label}</span>{aside && <span className="font-normal">{aside}</span>}</div>
      <div className="text-body text-text-primary">{value}</div>
      {note && <div className="mt-0.5 text-small text-text-muted">{note}</div>}
    </div>
  )
}

/** Join, seen again once the account exists: the name editable, the username fixed, the password as set. */
export function JoinReviewStep({ data, onNext }: { data: OnboardingData; onNext: () => void }) {
  const { me } = data
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
    <OnboardingFrame identity={data.identity} step="join" needsModel={data.needsModel}>
      <Heading title={`Join ${data.orgName}`} lead="The account you created." />
      <form onSubmit={next}>
        <ShowAttention text={error} title="You did not join" />
        <Field id="join-name" label="Your name" aside="shown on your work" autoComplete="name" autoFocus value={name} onChange={e => setName(e.target.value)} />
        <Fact label="Username" aside="how you sign in · can't be changed" value={me.username ?? ''} />
        <Fact label="Password" value="Set" note="Change it any time in Settings › Sign-in" />
        <StepButtons next="submit" nextLabel={saving ? 'Saving…' : 'Continue'} busy={saving} />
      </form>
    </OnboardingFrame>
  )
}
