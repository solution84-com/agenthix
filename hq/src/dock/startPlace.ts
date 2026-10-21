import { useQuery, getProjectByKey } from 'wasp/client/operations'
import { CHAT_PATH } from '../chat/chatComposer'

/** A place a new conversation can start in (adr-0096): the person's own space, or a project by its key. */
export type PlaceRef = { kind: 'space' } | { kind: 'project'; key: string }

export const SPACE_REF: PlaceRef = { kind: 'space' }

const PROJECT_ADDRESS = /^\/projects\/([^/]+)/
const TASK_ADDRESS = /^\/tasks\/(.+)-\d+(?:\/|$)/

/**
 * The place the canvas is on (spec §10): anything inside a project — its sections, a board, a task, a workspace or a
 * file, which all open under the project's address or a task's — is that project; anywhere else is your space.
 */
export function canvasPlaceOf(pathname: string): PlaceRef {
  const project = PROJECT_ADDRESS.exec(pathname)
  if (project) return { kind: 'project', key: decodeURIComponent(project[1]) }
  const task = TASK_ADDRESS.exec(pathname)
  if (task) return { kind: 'project', key: decodeURIComponent(task[1]) }
  return SPACE_REF
}

export function samePlace(a: PlaceRef, b: PlaceRef): boolean {
  return a.kind === b.kind && (a.kind === 'space' || (b.kind === 'project' && a.key === b.key))
}

/** A place as `NewConversationBox` and the conversation lists take it. */
export interface StartPlace {
  ref: PlaceRef
  label: string
  home: 'PERSON' | 'PROJECT'
  projectId?: string
  /** Where its conversations live: `/chat` or `/projects/KEY`. */
  basePath: string
  placeholder: string
  noAgentsNotice: string
}

export const SPACE_START: StartPlace = {
  ref: SPACE_REF,
  label: 'Your space',
  home: 'PERSON',
  basePath: CHAT_PATH,
  placeholder: 'Ask any agent…',
  noAgentsNotice: 'Add an agent to the organisation to talk to it',
}

interface ProjectByKey { id: string; key: string; name: string; personalOwnerId: string | null }

/** The place behind a reference, read with the query a project's own screens already use; null while it loads. */
export function useStartPlace(ref: PlaceRef): StartPlace | null {
  const key = ref.kind === 'project' ? ref.key : null
  const { data, error } = useQuery(getProjectByKey, key ? { key } : undefined, { enabled: !!key })
  if (!key) return SPACE_START
  const project: ProjectByKey | null | undefined = data
  // A project the person cannot see, or their own personal one, is their space.
  if (error || project === null || project?.personalOwnerId) return SPACE_START
  if (!project) return null
  return {
    ref,
    label: project.name,
    home: 'PROJECT',
    projectId: project.id,
    basePath: `/projects/${project.key}`,
    placeholder: 'Talk about this project…',
    noAgentsNotice: 'Add an agent to this project to talk to it',
  }
}
