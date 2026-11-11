import { Link } from 'react-router'
import { FOCUS_RING } from '@agenthix/ui/primitives'
import type { AgentPlaceLine } from './types'

export function countsOf(p: Pick<AgentPlaceLine, 'on' | 'off' | 'setAside'>): string {
  return [`${p.on} on`, p.off > 0 ? `${p.off} off` : null, p.setAside > 0 ? `${p.setAside} set aside` : null].filter(Boolean).join(' · ')
}

/** A place the agent works in, as one line with its counts; the skills themselves are on the place's own page. */
export function PlaceLine({ place, open = true }: { place: AgentPlaceLine; open?: boolean }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2" data-testid="agent-place-line">
      <div className="min-w-0 flex-1 basis-64">
        <p className="text-body"><span className="font-medium text-text-primary">{place.name}</span> <span className="text-small text-text-muted">{countsOf(place)}</span></p>
        {place.onNames.length > 0 && <p className="break-words text-small text-text-secondary">{place.onNames.join(' · ')}</p>}
      </div>
      {open && <Link to={`/projects/${place.projectKey}`} className={`rounded shrink-0 text-small font-medium text-link hover:underline ${FOCUS_RING}`}>Open</Link>}
    </li>
  )
}
