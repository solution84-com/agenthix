import { useState } from 'react'
import { Link } from 'react-router'
import { Kanban } from 'lucide-react'
import { useQuery, getAllBoards } from 'wasp/client/operations'
import { FilterSelect, PlaceAvatar } from '@agenthix/ui/primitives'
import { ColumnBar, SprintTag, countsLine, daysLeftText, type BoardListItem } from '@agenthix/ui/board'
import { EmptyState } from '../../shared/components/ui/EmptyState'
import type { BoardAcrossProjects } from '../boardsAcrossProjects'
import { boardAddress } from '../placeAddresses'
import { boardPlace, visibleBoards } from './acrossLists'
import { ProjectsControls } from './ProjectsControls'
import { useProjectsScreenUrl } from './projectsScreenUrl'

/** How often the list reads the boards again, so "N needs you" keeps up. */
const REFRESH_MS = 15_000

const GRID = 'md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] md:items-center md:gap-4'

function BoardRow({ board }: { board: BoardAcrossProjects }) {
  const place = boardPlace(board)
  const sprint = board.currentSprint
  const item = board as unknown as BoardListItem
  return (
    <li>
      <Link to={boardAddress(place, board.id)} className={`block min-w-0 border-b border-border-subtle px-1 py-2.5 hover:bg-surface-hover ${GRID}`}>
        <span className="flex min-w-0 items-center gap-2">
          <b className="truncate text-body font-semibold text-text-primary">{board.name}</b>
          {board.needsYouCount > 0 && (
            <span className="shrink-0 rounded-full bg-warning/20 px-2 text-micro font-medium text-warning">
              {board.needsYouCount} {board.needsYouCount === 1 ? 'needs' : 'need'} you
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-small text-text-secondary">
          <PlaceAvatar kind="project" id={board.project.id} name={place.name} size="xs" />
          <span className="truncate">{place.name}</span>
          {sprint && <span className="truncate text-text-muted md:hidden">· {sprint.label} · {daysLeftText(sprint.daysLeft)}</span>}
        </span>
        <span className="mt-1 block min-w-0 space-y-1 md:mt-0">
          <ColumnBar backlogCount={item.backlogCount} columns={item.columns} />
          <span className="block truncate text-micro text-text-muted">{countsLine(item.backlogCount, item.columns)}</span>
        </span>
        <span className="hidden min-w-0 truncate text-small text-text-muted md:block">
          {sprint ? <><SprintTag sprint={sprint} /> · {daysLeftText(sprint.daysLeft)}</> : '—'}
        </span>
      </Link>
    </li>
  )
}

/** Every board in the person's projects, each opening in its project's Boards tool (every screen reviewed spec §3). */
export function BoardsAcrossView() {
  const { screen, filter } = useProjectsScreenUrl()
  const { data, isLoading } = useQuery(getAllBoards, undefined, { refetchInterval: REFRESH_MS })
  const [search, setSearch] = useState('')
  const all: BoardAcrossProjects[] = data ?? []
  const shown = visibleBoards(all, { archived: screen.archived, project: screen.project, search })
  const archivedCount = all.filter(b => !!b.archivedAt).length
  const places = new Map(all.map(b => [boardPlace(b).filterValue, boardPlace(b).name]))

  return (
    <>
      <ProjectsControls search={search} onSearch={setSearch} searchLabel="Search boards">
        <button
          type="button" aria-pressed={screen.archived} onClick={() => filter({ archived: screen.archived ? null : '1' })}
          className={`rounded-lg border px-3 py-1.5 text-small ${screen.archived ? 'border-accent bg-accent/10 text-text-primary' : 'border-border-subtle bg-surface-1 text-text-secondary hover:bg-surface-hover'}`}
        >
          Archived <span className="rounded-full bg-surface-2 px-1.5 text-micro text-text-secondary">{archivedCount}</span>
        </button>
        {places.size > 0 && (
          <FilterSelect label="Project" value={screen.project ?? ''} onChange={v => filter({ project: v || null })}>
            <option value="">All projects</option>
            {[...places].map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </FilterSelect>
        )}
      </ProjectsControls>
      {isLoading ? (
        <p className="text-body text-text-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Kanban}
          title={all.length === 0 ? 'No boards yet' : search || screen.project ? 'No boards match' : screen.archived ? 'No board is archived' : 'No active boards'}
          hint={all.length === 0 ? 'New board… makes one in a project' : undefined}
        />
      ) : (
        <div>
          <div className={`hidden border-b border-border-subtle px-1 pb-1.5 text-micro font-medium uppercase tracking-wide text-text-muted ${GRID}`}>
            <span>Board</span><span>Project</span><span>Tasks in each column</span><span>Sprint</span>
          </div>
          <ul>{shown.map(b => <BoardRow key={b.id} board={b} />)}</ul>
        </div>
      )}
    </>
  )
}
