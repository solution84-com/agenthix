import { useState } from 'react'
import { useQuery, getMyPhones, signOutPhone } from 'wasp/client/operations'
import { Button } from '@agenthix/ui/primitives'

/** Settings › Devices and connections › Phone: the phones signed in as this person, each with Sign out. */
export function SignedInPhones() {
  const { data: phones, refetch } = useQuery(getMyPhones)
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  async function signOut(id: string) {
    setBusy(id)
    setProblem(null)
    try {
      await signOutPhone({ id })
      await refetch()
    } catch {
      setProblem('Could not sign that phone out. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  if (!phones) return null

  return (
    <section aria-labelledby="signed-in-phones" className="mt-10 pt-8 border-t border-border-subtle">
      <h2 id="signed-in-phones" className="text-h3 font-semibold text-text-primary mb-3">Phones signed in as you</h2>
      {problem && <div role="alert" className="text-body text-danger mb-3">{problem}</div>}
      {phones.length === 0 ? (
        <p className="text-body text-text-secondary">No phone is signed in as you.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {phones.map(phone => (
            <li key={phone.id} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-body text-text-primary truncate">{phone.deviceName}</div>
                <div className="text-small text-text-muted">Last used {new Date(phone.lastUsedAt).toLocaleString()}</div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy === phone.id}
                onClick={() => void signOut(phone.id)}
                aria-label={`Sign out ${phone.deviceName}`}
              >
                Sign out
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
