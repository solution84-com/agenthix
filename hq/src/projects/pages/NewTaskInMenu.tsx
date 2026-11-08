import { useQuery, getProjects, getMyPersonalProject } from 'wasp/client/operations'
import { MENU_ITEM, MenuHeading, PlaceAvatar, PopSheet } from '@agenthix/ui/primitives'

type Listed = { id: string; key: string; name: string; isMember: boolean; myRole: string | null; personalOwnerId: string | null }

/** The places a person may make a task in: the projects they work in, then their own space. */
export function useNewTaskPlaces(): { key: string; name: string; id: string }[] {
  const { data: projects } = useQuery(getProjects)
  const { data: space } = useQuery(getMyPersonalProject)
  const listed = (Array.isArray(projects) ? projects : []) as Listed[]
  const working = listed
    .filter(p => !p.personalOwnerId && p.isMember && p.myRole !== 'VIEWER')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => ({ id: p.id, key: p.key, name: p.name }))
  return space ? [...working, { id: space.id, key: space.key, name: 'Your space' }] : working
}

/**
 * New task on Your tasks asks where first (Y1): a task belongs to one project, so the menu lists the projects the
 * person works in and their own space; choosing one opens New task there.
 */
export function NewTaskInMenu({ onChoose, onClose }: { onChoose: (projectKey: string) => void; onClose: () => void }) {
  const places = useNewTaskPlaces()
  return (
    <PopSheet label="New task in" onClose={onClose}>
      <MenuHeading label="New task in…" />
      {places.length === 0 && <p className="px-3 py-2 text-small text-text-muted">Loading…</p>}
      {places.map(p => (
        <button key={p.id} type="button" role="menuitem" className={`${MENU_ITEM} items-center`} onClick={() => onChoose(p.key)}>
          <PlaceAvatar kind="project" id={p.id} name={p.name} size="sm" />
          <span className="min-w-0 flex-1 truncate">{p.name}</span>
        </button>
      ))}
    </PopSheet>
  )
}
