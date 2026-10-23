import { useQuery, useAction, getProjectBilling, getBillingProfileChoices, setProjectBillingProfile } from 'wasp/client/operations'
import { NativeSelect } from '@agenthix/ui/primitives'
import { Part, ReadOnlyValue } from '../../projects/pages/settings/Part'
import { usePartSave } from '../../projects/pages/settings/usePartSave'

const dayOf = (iso: string) => new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' })

/**
 * A project's billing profile, in its Settings. Everyone who sees the project reads it; organisation admins change it,
 * from the next call. Shown only when the organisation has more than one profile to choose between.
 */
export function ProjectBillingSection({ projectId }: { projectId: string }) {
  const { data: billing } = useQuery(getProjectBilling, { projectId })
  const { data: choices } = useQuery(getBillingProfileChoices)
  const change = useAction(setProjectBillingProfile)
  const save = usePartSave()
  if (!billing || !choices || choices.length < 2) return null

  const current = billing.billingProfile
  const last = billing.lastChange
  const history = last && `Changed${last.byName ? ` by ${last.byName}` : ''} on ${dayOf(last.at)}${last.fromName ? ` from ${last.fromName}` : ''}.`
  return (
    <Part label="AI cost billed to" htmlFor="set-billing" save={save}
      hint={billing.mayChange ? <>From the next call. {history}</> : <>Set by organisation admins. {history}</>}>
      {billing.mayChange ? (
        <NativeSelect id="set-billing" value={current?.id ?? ''} onChange={e => void save.save(() => change({ projectId, billingProfileId: e.target.value }))}>
          {!current && <option value="" disabled>Choose</option>}
          {choices.map(c => <option key={c.id} value={c.id}>{c.name}{c.isDefault ? ' (default)' : ''}</option>)}
        </NativeSelect>
      ) : (
        <ReadOnlyValue id="set-billing">{current?.name ?? 'The default'}</ReadOnlyValue>
      )}
    </Part>
  )
}
