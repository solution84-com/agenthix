import { useState, type FormEvent } from 'react'
import type { HqAccount } from '@agenthix/core'
import { Button, FormField, Input, Modal, StatePill } from '@agenthix/ui/primitives'
import { HqLink } from '../../components'
import { findAccount, giveRole } from './useFleetAdmins'

const TITLE = 'Give the fleet admin role to…'
/** HQ's People page, where a person who is not in HQ yet is added. */
const HQ_PEOPLE = '/org/people'

type Found =
  | { phase: 'idle' }
  | { phase: 'finding' }
  | { phase: 'found'; account: HqAccount }
  | { phase: 'none'; username: string }
  | { phase: 'problem'; message: string }

/** Giving the role to an account that already exists in HQ, found by the username it signs in with. */
export function GiveRoleModal({ open, org, address, onClose, onGiven }: {
  open: boolean; org: string | null; address: string | null; onClose: () => void; onGiven: () => void
}) {
  const [username, setUsername] = useState('')
  const [found, setFound] = useState<Found>({ phase: 'idle' })
  const [giving, setGiving] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)

  const close = () => {
    setUsername('')
    setFound({ phase: 'idle' })
    setRefusal(null)
    setGiving(false)
    onClose()
  }

  const find = (e: FormEvent) => {
    e.preventDefault()
    const wanted = username.trim()
    if (!wanted) return
    setFound({ phase: 'finding' })
    setRefusal(null)
    findAccount(wanted)
      .then(account => setFound(account ? { phase: 'found', account } : { phase: 'none', username: wanted }))
      .catch((err: unknown) => setFound({ phase: 'problem', message: err instanceof Error ? err.message : String(err) }))
  }

  const give = (account: HqAccount) => {
    setGiving(true)
    setRefusal(null)
    giveRole(account.id)
      .then(() => { setUsername(''); setFound({ phase: 'idle' }); setGiving(false); onGiven() })
      .catch((err: unknown) => { setGiving(false); setRefusal(err instanceof Error ? err.message : String(err)) })
  }

  return (
    <Modal open={open} onClose={close} title={TITLE}>
      <section aria-label={TITLE} className="space-y-3 text-body text-text-primary">
        <p className="text-small text-text-secondary">Pick an account that already exists in HQ, by the username it signs in with.</p>
        <form onSubmit={find} className="flex items-end gap-2">
          <div className="flex-1">
            <FormField label="Username in HQ" htmlFor="give-role-username">
              <Input id="give-role-username" autoComplete="off" value={username} onChange={e => setUsername(e.target.value)} />
            </FormField>
          </div>
          <Button type="submit" variant="secondary" disabled={found.phase === 'finding' || !username.trim()}>Find</Button>
        </form>

        {found.phase === 'found' && (
          <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-border px-3 py-2.5">
            <div className="min-w-0 flex-1 text-small">
              <b className="font-semibold">{found.account.name}</b>
              <code className="ml-2 font-mono text-micro text-text-muted">{found.account.username}</code>
            </div>
            {found.account.organisationAdmin && <StatePill>Organisation admin</StatePill>}
            {found.account.fleetAdmin
              ? <p className="w-full text-small text-text-secondary">{found.account.name} already holds the fleet admin role.</p>
              : <Button size="sm" disabled={giving} onClick={() => give(found.account)}>Give the role</Button>}
          </div>
        )}
        {found.phase === 'none' && (
          <div className="space-y-2 text-small text-text-secondary">
            <p>No account in HQ has the username {found.username}. Add the person in HQ first.</p>
            {address && <div className="flex"><HqLink address={address} path={HQ_PEOPLE}>Open People in HQ ↗</HqLink></div>}
          </div>
        )}
        {found.phase === 'problem' && <p className="text-small text-danger">{found.message}</p>}
        {refusal && <p className="text-small text-danger">{refusal}</p>}

        <p className="text-small text-text-muted">
          Every fleet admin and organisation admin is told. The role lets them act on every machine {org ?? 'the organisation'} runs here.
        </p>
        <div className="flex justify-end"><Button variant="secondary" onClick={close}>Cancel</Button></div>
      </section>
    </Modal>
  )
}
