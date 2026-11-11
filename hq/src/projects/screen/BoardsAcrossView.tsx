import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, getBoardViewsAcrossProjects } from 'wasp/client/operations'
import { useBackgroundRead } from '@agenthix/ui/attention'
import { EmptyState, FilterSelect, PlaceAvatar, FOCUS_RING_INSET } from '@agenthix/ui/primitives'
import { BoardChip, NeedsYouPill, SpreadBar, movedWords } from '@agenthix/ui/board'
import type { ProjectBoards } from '../boardViewsAcrossProjects'
import type { BoardListEntry } from '../boardListService'
import { boardAddress } from '../placeAddresses'
import { boardWhat } from '../boards/boardViewModel'
import { projectPlace, visibleBoards } from './acrossLists'
import { ListControls } from './ListControls'
import { useAcrossListUrl } from './acrossListUrl'

/** How often the list reads the boards again, so "N needs you" keeps up. */
const REFRESH_MS = 15_000

const GRID = 'md:grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.8fr)_minmax(0,0.8fr)] md:items-center md:gap-4'

const capital = (words: string) => words.charAt(0).toUpperCase() + words.slice(1)

/** A board's row: its name and facts, what it groups by, its spread, and when a card last moved. It opens in its project. */
function BoardRow({ board, place, now }: { board: BoardListEntry; place: ReturnType<typeof projectPlace>; now: Date }) {
  const what = board.kind === 'EXECUTION' ? 'Read-only, by what each run is doing'
    : capital(boardWhat({ kind: board.kind, typeId: board.typeId, fieldId: board.fieldId, filter: board.filter }, board))
  const moved = board.kind === 'EXECUTION' ? null : movedWords(board.lastMovedAt, now)
  return (
    <li>
      <Link to={boardAddress(place, board.key)} className={`block min-w-0 border-b border-border-subtle px-1 py-2.5 hover:bg-surface-hover active:bg-surface-pressed ${FOCUS_RING_INSET} ${GRID}`}>
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <b className="truncate text-body font-medium text-text-primary">{board.name}</b>
            {board.builtIn && <BoardChip>Built in</BoardChip>}
            {board.needsYouCount > 0 && <NeedsYouPill count={board.needsYouCount} />}
          </span>
          <span className="truncate text-small text-text-muted">{what}</span>
        </span>
        <span className="mt-1 block min-w-0 md:mt-0"><SpreadBar kind={board.kind} spread={board.spread} /></span>
        <span className="hidden truncate text-small text-text-muted md:block">{moved ? moved.replace(/^moved /, '') : '—'}</span>
      </Link>
    </li>
  )
}

function ProjectGroup({ group, now, first }: { group: ProjectBoards; now: Date; first: boolean }) {
  const place = projectPlace(group.project)
  const saved = group.boards.filter(b => !b.builtIn).length
  return (
    <section aria-label={place.name}>
      <h3 className={`flex items-center gap-2 text-body font-medium text-text-primary ${first ? 'mb-1 mt-4' : 'mb-1 mt-6'}`}>
        <PlaceAvatar kind="project" id={group.project.id} name={place.name} size="xs" />
        {place.name} <span className="font-normal text-text-muted">· {saved === 0 ? 'built in only' : group.boards.length}</span>
      </h3>
      <ul>{group.boards.map(b => <BoardRow key={b.key} board={b} place={place} now={now} />)}</ul>
      {saved === 0 && <p className="py-2 text-small text-text-muted">Only the built-in Task state and Execution boards; no board saved yet.</p>}
    </section>
  )
}

/** Boards in the rail (D20): every board in the person's projects, grouped by project, each opening in its project. */
export function BoardsAcrossView() {
  const { screen, filter } = useAcrossListUrl()
  const query = useQuery(getBoardViewsAcrossProjects, undefined, { refetchInterval: REFRESH_MS })
  const { data, isLoading } = query
  const read = useBackgroundRead(query, { what: 'The boards', pollMs: REFRESH_MS })
  const [search, setSearch] = useState('')
  const [now] = useState(() => new Date())
  const all: ProjectBoards[] = data ?? []
  const shown = visibleBoards(all, { project: screen.project, search })
  const places = all.map(g => projectPlace(g.project))

  return (
    <>
      <ListControls search={search} onSearch={setSearch} searchLabel="Search boards">
        {places.length > 1 && (
          <FilterSelect label="Project" value={screen.project ?? ''} onChange={v => filter({ project: v || null })}>
            <option value="">All projects</option>
            {places.map(p => <option key={p.filterValue} value={p.filterValue}>{p.name}</option>)}
          </FilterSelect>
        )}
      </ListControls>
      {!read.failedWithoutData && read.nudge}
      {read.failedWithoutData ? (
        read.nudge
      ) : isLoading ? (
        <p className="text-body text-text-muted">Loading…</p>
      ) : shown.length === 0 ? (
        <EmptyState variant="inline" title={all.length === 0 ? 'No boards yet. New board makes one in a project.' : 'No board matches.'} />
      ) : (
        <div>
          <div className={`hidden border-b border-border-subtle px-1 pb-1.5 text-micro font-medium uppercase tracking-wide text-text-muted ${GRID}`}>
            <span>Board</span><span>Tasks in each column</span><span>Last moved</span>
          </div>
          {shown.map((g, i) => <ProjectGroup key={g.project.id} group={g} now={now} first={i === 0} />)}
        </div>
      )}
    </>
  )
}
