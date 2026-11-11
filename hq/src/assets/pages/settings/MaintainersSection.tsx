import { useState } from 'react'
import { useAction, useQuery, getOrgPeople, listLibraryMaintainers, nameLibraryMaintainer, removeLibraryMaintainer } from 'wasp/client/operations'
import { refusalText } from '../../../shared/refusal'
import { SettingBlock } from './ChoiceGroup'
import { ConfirmDialog, NativeSelect, BUTTON_SECONDARY } from '@agenthix/ui/primitives'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'

const PLAIN = `rounded-lg px-3 py-1.5 text-body ${BUTTON_SECONDARY}`

/**
 * Library maintainers (board R2, D28): the one role beside administrators. Naming someone shows what the role reaches
 * and goes ahead only once that is confirmed; the people are named from the organisation's list.
 */
export function MaintainersSection() {
  const maintainers = useQuery(listLibraryMaintainers)
  const read = useBackgroundRead(maintainers, { what: 'The maintainers' })
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
      {read.nudge}
      <ul className="mt-2 divide-y divide-border-subtle" data-testid="maintainers">
        {(maintainers.data ?? []).map(m => (
          <li key={m.userId} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 text-body text-text-primary">{nameOf(m.userId)}</span>
            <button type="button" disabled={state.busy} onClick={() => void run(() => remove({ userId: m.userId }))} className="text-small font-medium text-text-secondary not-disabled:hover:text-text-primary disabled:opacity-40">Remove</button>
          </li>
        ))}
        {maintainers.data?.length === 0 && <li className="py-2 text-small text-text-muted">None named. Administrators do everything a Library maintainer does.</li>}
      </ul>
      <ConfirmDialog
        open={asking !== null} title={`Make ${asking ? nameOf(asking.userId) : ''} a Library maintainer?`} description={asking?.reach}
        confirmLabel="Make Library maintainer" busy={state.busy} onCancel={() => setAsking(null)} onConfirm={confirm}
      />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="maintainer-person">Person to name</label>
          <NativeSelect size="md" id="maintainer-person" value={choice} onChange={e => setChoice(e.target.value)}>
            <option value="">Choose a member…</option>
            {candidates.map(p => <option key={p.person.userId} value={p.person.userId}>{p.person.name}</option>)}
          </NativeSelect>
          <button type="button" className={PLAIN} disabled={state.busy || !choice} onClick={ask}>＋ Add a Library maintainer</button>
        </div>
      <ShowAttention kind="alert" text={state.error} title="The maintainers were not changed" onClose={() => setState({ busy: false, error: null })} />
      <p className="mt-2 text-small text-text-muted">A project's skills are published by the project's administrators; anyone with write access edits them.</p>
    </SettingBlock>
  )
}
