import { useState } from 'react'
import { useAction, useQuery, getOrgPeople, listLibraryMaintainers, nameLibraryMaintainer, removeLibraryMaintainer } from 'wasp/client/operations'
import { RefusedAction } from '../../../shared/components/RefusedAction'
import { refusalText } from '../../../shared/refusal'
import { SettingBlock } from './ChoiceGroup'

const PLAIN = 'rounded-lg border border-border bg-surface-1 px-3 py-1.5 text-body text-text-primary hover:bg-surface-hover disabled:opacity-50'

/**
 * Library maintainers (board R2, D28): the one role beside administrators. Naming someone shows what the role reaches
 * and goes ahead only once that is confirmed; the people are named from the organisation's list.
 */
export function MaintainersSection() {
  const maintainers = useQuery(listLibraryMaintainers)
  const people = useQuery(getOrgPeople)
  const name = useAction(nameLibraryMaintainer)
  const remove = useAction(removeLibraryMaintainer)
  const [choice, setChoice] = useState('')
  const [asking, setAsking] = useState<{ userId: string; reach: string } | null>(null)
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })

  const nameOf = (userId: string) => people.data?.people.find(p => p.person.userId === userId)?.person.name ?? 'A member'
  const named = new Set((maintainers.data ?? []).map(m => m.userId))
  const candidates = (people.data?.people ?? []).filter(p => p.person.state === 'active' && p.orgRole === 'MEMBER' && !named.has(p.person.userId))

  const run = async (work: () => Promise<unknown>) => {
    setState({ busy: true, error: null })
    try {
      await work()
      setState({ busy: false, error: null })
    } catch (err) {
      setState({ busy: false, error: refusalText(err) })
    }
    void maintainers.refetch()
  }
  const ask = () => void run(async () => {
    const out = await name({ userId: choice })
    if (!out.named) setAsking({ userId: choice, reach: out.reach })
  })
  const confirm = () => void run(async () => {
    if (!asking) return
    await name({ userId: asking.userId, reachConfirmed: true })
    setAsking(null)
    setChoice('')
  })

  return (
    <SettingBlock title="Library maintainers"
      intro="They maintain every asset in the Library: create new skills, edit and publish, accept updates, return to an earlier version, and review proposals aimed at the organisation. Choosing which agents have a skill, removing, the trust settings and naming Library maintainers stay with administrators.">
      {maintainers.error && <RefusedAction reason={refusalText(maintainers.error)} />}
      <ul className="mt-2 divide-y divide-border-subtle" data-testid="maintainers">
        {(maintainers.data ?? []).map(m => (
          <li key={m.userId} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 text-body text-text-primary">{nameOf(m.userId)}</span>
            <button type="button" disabled={state.busy} onClick={() => void run(() => remove({ userId: m.userId }))} className="text-small font-medium text-text-secondary hover:text-text-primary disabled:opacity-50">Remove</button>
          </li>
        ))}
        {maintainers.data?.length === 0 && <li className="py-2 text-small text-text-muted">None named. Administrators do everything a Library maintainer does.</li>}
      </ul>
      {asking ? (
        <div role="alertdialog" aria-label="Make a Library maintainer" className="mt-3 rounded-lg border border-warning/50 bg-warning/5 p-3" data-testid="maintainer-reach">
          <p className="text-body font-medium text-text-primary">Make {nameOf(asking.userId)} a Library maintainer?</p>
          <p className="mt-1 text-body text-text-primary">{asking.reach}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" className={PLAIN} onClick={() => setAsking(null)}>Cancel</button>
            <button type="button" disabled={state.busy} onClick={confirm} className="rounded-lg bg-accent px-3 py-1.5 text-body font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50">Make Library maintainer</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="maintainer-person">Person to name</label>
          <select id="maintainer-person" value={choice} onChange={e => setChoice(e.target.value)} className="rounded-lg border border-border bg-surface-1 px-2 py-1.5 text-body text-text-primary">
            <option value="">Choose a member…</option>
            {candidates.map(p => <option key={p.person.userId} value={p.person.userId}>{p.person.name}</option>)}
          </select>
          <button type="button" className={PLAIN} disabled={state.busy || !choice} onClick={ask}>＋ Add a Library maintainer</button>
        </div>
      )}
      <RefusedAction reason={state.error} onDismiss={() => setState({ busy: false, error: null })} className="mt-2" />
      <p className="mt-2 text-small text-text-muted">A project's skills are published by the project's administrators; anyone with write access edits them.</p>
    </SettingBlock>
  )
}
