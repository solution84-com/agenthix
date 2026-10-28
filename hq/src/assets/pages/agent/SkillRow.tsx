import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { libraryAssetPath } from '../../../library/components/libraryRoutes'
import type { AgentBuiltInLine, AgentSkillLine } from './types'

const CHIP = 'rounded-full bg-chip px-2 py-0.5 text-micro text-text-secondary'

/** One skill of the agent's list: its name opening its page in the Library, where it comes from, what it does. */
export function SkillRow({ line, action }: { line: AgentSkillLine; action?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2" data-testid="agent-skill-row">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-body">
          <Link to={libraryAssetPath(line.assetId)} className="font-medium text-text-primary hover:underline">{line.title}</Link>
          <span className="ml-2 text-small text-text-muted">{line.identity} {line.version}</span>
          {line.updateTo && <span className="ml-2 text-small text-warning">{line.updateTo} available</span>}
        </p>
        {line.description && <p className="text-small text-text-secondary">{line.description}</p>}
      </div>
      {action}
    </li>
  )
}

export function BuiltInRow({ line }: { line: AgentBuiltInLine }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2" data-testid="agent-skill-row">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-body">
          <span className="font-medium text-text-primary">{line.title}</span>
          <span className="ml-2 text-small text-text-muted">{line.identity} · built in</span>
        </p>
        <p className="text-small text-text-secondary">
          {line.description}
          {line.repositoryOnly && ' Only in runs inside a workspace with a repository.'}
        </p>
      </div>
      <span className={CHIP}>{line.on ? 'on' : 'switched off'}</span>
    </li>
  )
}

export function GroupHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mt-5 flex items-baseline justify-between gap-3 first:mt-0">
      <h4 className="text-small font-semibold text-text-primary">{children}</h4>
      {aside && <span className="text-micro text-text-muted">{aside}</span>}
    </div>
  )
}
