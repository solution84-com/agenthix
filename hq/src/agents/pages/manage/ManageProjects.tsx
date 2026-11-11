import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useAction, getAgentAssignments, addAgentToProject } from 'wasp/client/operations'
import { SearchField, FOCUS_RING_INSET, ROW_ITEM, FOCUS_RING } from '@agenthix/ui/primitives'
import type { AgentUsageView } from '../../agentUsageQueries'
import { costLabel } from '../place/usageView'
import { approvalLabel } from '../approvalLabel'
import { ReadFailure, ShowAttention } from '@agenthix/ui/attention'

const HEADING = 'text-micro font-medium uppercase tracking-wide text-text-muted'

/**
 * Projects (spec §3): every one the agent is assigned to, with its narrowing there and what it cost, and Assign
 * to any project. A private project the admin is not in is named but never opened (lane AA, report item 4).
 */
export function ManageProjects({ agentId, usage }: { agentId: string; usage: AgentUsageView | undefined }) {
  const { data, error } = useQuery(getAgentAssignments, { agentId })
  const assign = useAction(addAgentToProject)
  const [picking, setPicking] = useState(false)
  const [search, setSearch] = useState('')
  const [failure, setFailure] = useState('')

  const costOf = (projectId: string) => usage?.byProject?.find(b => b.project.id === projectId)?.usage
  const options = (data?.assignable ?? []).filter(p => !search.trim() || `${p.name} ${p.key}`.toLowerCase().includes(search.trim().toLowerCase()))

  const pick = async (projectId: string) => {
    setFailure('')
    try {
      await assign({ projectId, agentId })
      setPicking(false)
      setSearch('')
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Could not assign')
    }
  }

  return (
    <section aria-label="Projects">
      <div className="flex items-center justify-between">
        <h3 className={HEADING}>Projects</h3>
        <button type="button" onClick={() => setPicking(p => !p)} className={`rounded text-small font-medium text-link hover:underline ${FOCUS_RING}`}>
          {picking ? 'Cancel' : 'Assign'}
        </button>
      </div>
      {error && <ReadFailure what="The projects" error={error} />}
      <ShowAttention text={failure} title="The project was not assigned" onClose={() => setFailure('')} />

      {picking && (
        <div className="mt-2 rounded-lg border border-border-subtle p-2">
          <SearchField label="Search projects" value={search} onChange={setSearch} className="w-full" />
          <div className="mt-1 max-h-48 overflow-y-auto">
            {options.length === 0 && <p className="px-2 py-2 text-small text-text-muted">No project left to assign it to.</p>}
            {options.map(p => (
              <button key={p.id} type="button" onClick={() => void pick(p.id)} className={`block w-full rounded-lg px-2 py-1.5 text-left text-body ${ROW_ITEM} ${FOCUS_RING_INSET}`}>
                {p.name} <span className="font-mono text-small text-text-muted">{p.key}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {data && data.assignments.length === 0 && !picking && <p className="mt-2 text-small text-text-muted">Not assigned to any project yet.</p>}
      {data?.assignments.map(({ project, narrowing }) => {
        const spent = costOf(project.id)
        const narrowed = [narrowing?.model, narrowing?.approval && `approval ${approvalLabel(narrowing.approval)}`, narrowing?.allowedTools ? 'tools' : null, narrowing?.allowedBashPatterns ? 'commands' : null].filter(Boolean)
        return (
          <div key={project.id} className="border-t border-border-subtle py-2.5 first:border-t-0">
            <Link to={`/projects/${project.key}?tool=agents&agent=${agentId}`} className={`rounded text-body font-medium text-text-primary hover:underline ${FOCUS_RING}`}>{project.name}</Link>
            <div className="text-small text-text-muted">
              {narrowed.length > 0 ? `Narrowed there: ${narrowed.join(', ')}` : 'Its own settings'}
              {spent && spent.runCount > 0 ? ` · ${costLabel(spent)} this month` : ''}
            </div>
          </div>
        )
      })}
      {data && data.privateProjects > 0 && (
        // Private projects the admin is not in are counted, never named (owner, 2026-10-08).
        <div className="border-t border-border-subtle py-2.5">
          <span className="text-body font-medium text-text-primary">
            {data.privateProjects === 1 ? 'A private project' : `${data.privateProjects} private projects`}
          </span>
          <div className="text-small text-text-muted">
            You are not a member
            {usage?.privateProjects && usage.privateProjects.runCount > 0 ? ` · ${costLabel(usage.privateProjects)} this month` : ''}
          </div>
        </div>
      )}
      {data && data.personalSpaces > 0 && (
        <p className="mt-2 text-small text-text-muted">And in {data.personalSpaces} {data.personalSpaces === 1 ? 'person\'s' : 'people\'s'} own spaces.</p>
      )}
    </section>
  )
}
