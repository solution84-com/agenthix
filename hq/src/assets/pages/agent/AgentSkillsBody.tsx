import { useState } from 'react'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import { Link } from 'react-router'
import { useAction, addAssetToAgents, removeAssetFromAgent } from 'wasp/client/operations'
import { refusalText } from '../../../shared/refusal'
import { LIBRARY_PATH } from '../../../library/components/libraryRoutes'
import { AddSkillPicker } from './AddSkillPicker'
import { PlaceLine } from './PlaceLine'
import { BuiltInRow, GroupHeading, PlainRow, SkillRow } from './SkillRow'
import { costLine, listingCost } from './skillCost'
import { noPlacesText, summaryLine } from './summary'
import type { AgentSkillsView } from './types'
import { ShowAttention } from '@agenthix/ui/attention'

const LIST = 'divide-y divide-border-subtle'
const NONE = 'py-2 text-small text-text-muted'
const count = (n: number) => `${n} ${n === 1 ? 'skill' : 'skills'}`

/**
 * The agent's Skills as rows under headings (spec part 6, board A1), for the manage page and the agent's own page:
 * built in, every agent has these, the agent has these, each project it works in, the viewer's own, then what was set
 * aside and why. Administrators also get Add and Remove; a member reads.
 */
export function AgentSkillsBody({ agentId, data, refetch }: { agentId: string; data: AgentSkillsView; refetch: () => unknown }) {
  const give = useAction(addAssetToAgents)
  const take = useAction(removeAssetFromAgent)
  const [picking, setPicking] = useState(false)
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })

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
  const remove = (assetId: string) => data.mayManage && (
    <button type="button" disabled={state.busy} onClick={() => void run(() => take({ assetId, agentId }))} className="shrink-0 text-small font-medium text-text-secondary not-disabled:hover:text-text-primary disabled:opacity-40">
      Remove from {name}
    </button>
  )

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-body font-medium text-text-primary" data-testid="agent-skills-summary">{summaryLine(data)}</p>
          <p className="mt-0.5 text-small text-text-muted" data-testid="agent-skills-cost">What {name} will see on every request: {costLine(cost)}</p>
        </div>
        {data.mayManage && (
          <button type="button" onClick={() => setPicking(p => !p)} className={`rounded shrink-0 text-small font-medium text-link hover:underline ${FOCUS_RING}`}>
            {picking ? 'Cancel' : 'Add a skill'}
          </button>
        )}
      </div>
      {picking && <AddSkillPicker agentName={name} options={data.addable} busy={state.busy} onAdd={(assetId) => void run(async () => { await give({ assetId, agentIds: [agentId] }); setPicking(false) })} />}
      <ShowAttention kind="alert" text={state.error} title="The skills were not changed" onClose={() => setState({ busy: false, error: null })} />

      <div className="mt-5">
        <GroupHeading count={count(data.builtIn.length)} note={<>Part of the product, in every agent. Switched on or off for every agent together in <Link to="/admin/settings/library" className={`rounded text-link hover:underline ${FOCUS_RING}`}>Settings</Link>.</>}>Built in</GroupHeading>
        <ul className={LIST}>{data.builtIn.map(b => <BuiltInRow key={b.assetId} line={b} />)}</ul>

        <GroupHeading count={count(data.everyAgent.length)} note={<>Given to every agent in the organisation, from <Link to={LIBRARY_PATH} className={`rounded text-link hover:underline ${FOCUS_RING}`}>the Library</Link>.</>}>Every agent has these</GroupHeading>
        {data.everyAgent.length === 0 ? <p className={NONE}>None.</p> : <ul className={LIST}>{data.everyAgent.map(s => <SkillRow key={s.assetId} line={s} />)}</ul>}

        <GroupHeading count={count(data.thisAgent.length)} note={`Given to ${name} alone.`}>{name} has these</GroupHeading>
        {data.thisAgent.length === 0 ? <p className={NONE}>None.</p> : <ul className={LIST}>{data.thisAgent.map(s => <SkillRow key={s.assetId} line={s} action={remove(s.assetId)} />)}</ul>}

        <GroupHeading note="Skills kept in a project's files. Each project switches its own, on its Skills page.">Where {name} works</GroupHeading>
        {data.places.length === 0 ? <p className={NONE} data-testid="agent-no-places">{noPlacesText(name, data.hiddenPlaces)}</p> : <ul className={LIST}>{data.places.map(p => <PlaceLine key={p.projectId} place={p} />)}</ul>}
        {data.places.length > 0 && data.hiddenPlaces > 0 && <p className="text-small text-text-muted">{name} also works in {data.hiddenPlaces} {data.hiddenPlaces === 1 ? 'project' : 'projects'} you aren't in; their administrators switch their skills.</p>}

        <GroupHeading count={count(data.yours.length)} note={`Yours alone. They join your conversations with ${name}.`}>Your own skills</GroupHeading>
        {data.yours.length === 0 ? <p className={NONE}>None switched on.</p> : (
          <ul className={LIST}>{data.yours.map(y => (
            <PlainRow key={y.name} title={y.name}>{y.description && <p className="text-small text-text-secondary">{y.description}</p>}</PlainRow>
          ))}</ul>
        )}
        <p className="text-small"><Link to="/space" className={`rounded font-medium text-link hover:underline ${FOCUS_RING}`}>Manage in Your space</Link></p>

        {data.setAside.length > 0 && (
          <div data-testid="agent-set-aside">
            <GroupHeading count={count(data.setAside.length)} note="Not used, because a skill with the same name at a higher level won.">Set aside</GroupHeading>
            <ul className={LIST}>{data.setAside.map((s, i) => (
              <PlainRow key={`${s.where}-${s.name}-${i}`} title={s.name}>
                <p className="text-small text-text-muted">In {s.where}</p>
                <p className="text-small text-text-secondary">{s.reason}</p>
              </PlainRow>
            ))}</ul>
          </div>
        )}
      </div>
    </div>
  )
}
