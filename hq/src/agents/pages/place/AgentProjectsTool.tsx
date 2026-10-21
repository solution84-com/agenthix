import { Link } from 'react-router'
import type { AgentPlaceView } from '../../agentPlaceQueries'

/** The projects the person is in that it is assigned to (spec §3); each opens that project's Agents tool. */
export function AgentProjectsTool({ agentId, projects, modelLabel }: { agentId: string; projects: AgentPlaceView['projects']; modelLabel: (model: string) => string }) {
  return (
    <div className="p-4">
      {projects.length === 0 && <p className="text-small text-text-muted">It is not in any project you can see.</p>}
      {projects.map(({ project, tasks, modelHere, narrowed }) => (
        <Link key={project.id} to={`/projects/${project.key}?tool=agents&agent=${agentId}`} className="block border-t border-border-subtle px-2 py-2.5 first:border-t-0 hover:bg-surface-hover">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-body font-medium text-text-primary">{project.name}</span>
            {tasks.needsYou > 0 && <span className="shrink-0 text-small font-semibold text-warning">{tasks.needsYou} needs you</span>}
          </div>
          <div className="text-small text-text-muted">
            {tasks.total === 0 ? 'No tasks' : `To do ${tasks.todo} · In progress ${tasks.inProgress}`}
            {narrowed ? ` · ${modelHere ? modelLabel(modelHere) : 'narrowed'} narrowed here` : ' · its own settings'}
          </div>
        </Link>
      ))}
      <p className="mt-3 text-small text-text-muted">Each opens that project's Agents tool on this agent.</p>
    </div>
  )
}
