import { useState } from 'react'
import { Link } from 'react-router'
import { useAction, useQuery, addAssetToAgents, getAgentSkillSet, removeAssetFromAgent } from 'wasp/client/operations'
import { RefusedAction } from '../../../shared/components/RefusedAction'
import { refusalText } from '../../../shared/refusal'
import { LIBRARY_PATH } from '../../../library/components/libraryRoutes'
import { AddSkillPicker } from './AddSkillPicker'
import { PlaceLine } from './PlaceLine'
import { BuiltInRow, GroupHeading, SkillRow } from './SkillRow'
import { costLine, costWarning, listingCost } from './skillCost'
import type { AgentSkillsView } from './types'
import { retryUnlessDenied } from '../../../projects/place/retryUnlessDenied'

const HEADING = 'text-micro font-medium uppercase tracking-wide text-text-muted'
const LIST = 'divide-y divide-border-subtle'

/** Why the "set aside" list is there: a skill with the same identity at a higher level won (D12, D16). */
function SetAside({ view }: { view: AgentSkillsView }) {
  if (view.setAside.length === 0) return null
  return (
    <div className="mt-5" data-testid="agent-set-aside">
      {view.setAside.map((s, i) => (
        <p key={`${s.where}-${s.name}-${i}`} className="text-small text-text-secondary">
          <span className="font-medium text-text-primary">{s.name}</span>, in {s.where}, set aside. {s.reason}
        </p>
      ))}
    </div>
  )
}

/**
 * The agent's Skills (spec part 6, board A1) on its manage page: everything it will see, by why it has it, in the order
 * a clash is settled in; what the list costs on every request; Add and Remove for administrators. The places' skills
 * are switched on each place's own page.
 */
export function AgentSkillsSection({ agentId }: { agentId: string }) {
  const { data, error, refetch } = useQuery(getAgentSkillSet, { agentId }, { retry: retryUnlessDenied })
  const give = useAction(addAssetToAgents)
  const take = useAction(removeAssetFromAgent)
  const [picking, setPicking] = useState(false)
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })

  if (error) return <section aria-label="Skills" className="border-t border-border-subtle py-4"><RefusedAction reason={refusalText(error)} /></section>
  if (!data) return <section aria-label="Skills" className="border-t border-border-subtle py-4"><p className="text-small text-text-muted">Loading…</p></section>

  const run = async (work: () => Promise<unknown>) => {
    setState({ busy: true, error: null })
    try {
      await work()
      setState({ busy: false, error: null })
    } catch (err) {
      setState({ busy: false, error: refusalText(err) })
    }
    void refetch()
  }
  const name = data.agent.name
  const cost = listingCost(data.listed)
  const warning = costWarning(name, cost, data.mayManage)
  const remove = (assetId: string) => data.mayManage && (
    <button type="button" disabled={state.busy} onClick={() => void run(() => take({ assetId, agentId }))} className="shrink-0 text-small font-medium text-text-secondary hover:text-text-primary disabled:opacity-50">
      Remove from {name}
    </button>
  )

  return (
    <section aria-label="Skills" className="border-t border-border-subtle py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className={HEADING}>Skills</h3>
        {data.mayManage && (
          <button type="button" onClick={() => setPicking(p => !p)} className="text-small font-medium text-accent hover:text-accent-hover">
            {picking ? 'Cancel' : 'Add a skill'}
          </button>
        )}
      </div>
      <p className="mt-1 text-small text-text-secondary" data-testid="agent-skills-cost">What {name} will see. {costLine(cost)}</p>
      {warning && <p role="status" className="mt-2 rounded-lg border border-warning/50 bg-warning/5 px-3 py-2 text-small text-text-primary" data-testid="agent-skills-warning">{warning}</p>}
      {picking && <AddSkillPicker agentName={name} options={data.addable} busy={state.busy} onAdd={(assetId) => void run(async () => { await give({ assetId, agentIds: [agentId] }); setPicking(false) })} />}
      <RefusedAction reason={state.error} onDismiss={() => setState({ busy: false, error: null })} className="mt-2" />

      <div className="mt-3">
        <GroupHeading aside="in every agent">Built in</GroupHeading>
        <ul className={LIST}>{data.builtIn.map(b => <BuiltInRow key={b.assetId} line={b} />)}</ul>
        <p className="mt-1 text-micro text-text-muted">A built-in skill is switched off for every agent in <Link to="/admin/settings/library" className="text-accent hover:text-accent-hover">Settings</Link>, never for one.</p>

        <GroupHeading aside={<Link to={LIBRARY_PATH} className="text-accent hover:text-accent-hover">In the Library</Link>}>Every agent has these</GroupHeading>
        {data.everyAgent.length === 0 ? <p className="py-2 text-small text-text-muted">None.</p> : <ul className={LIST}>{data.everyAgent.map(s => <SkillRow key={s.assetId} line={s} />)}</ul>}

        <GroupHeading>{name} has these</GroupHeading>
        {data.thisAgent.length === 0 ? <p className="py-2 text-small text-text-muted">None.</p> : <ul className={LIST}>{data.thisAgent.map(s => <SkillRow key={s.assetId} line={s} action={remove(s.assetId)} />)}</ul>}

        <GroupHeading aside="skills in files, as each place switches them">Where {name} works</GroupHeading>
        {data.places.length === 0 ? <p className="py-2 text-small text-text-muted">No place yet.</p> : <ul className={LIST}>{data.places.map(p => <PlaceLine key={p.projectId} place={p} />)}</ul>}
        {data.hiddenPlaces > 0 && <p className="text-micro text-text-muted">{name} also works in {data.hiddenPlaces} {data.hiddenPlaces === 1 ? 'place' : 'places'} you aren't in; their administrators switch their skills.</p>}

        <GroupHeading>People's own skills</GroupHeading>
        <p className="py-1 text-small text-text-secondary">When someone talks to {name}, their own switched-on skills join that conversation. They are each person's, so they aren't listed here.</p>
      </div>
      <SetAside view={data} />
    </section>
  )
}
