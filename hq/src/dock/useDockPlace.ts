import { useQuery, getProject, getTask } from 'wasp/client/operations'
import type { ConversationView } from '../shared/conversations/protocol'
import { CHAT_PATH } from '../chat/chatComposer'
import { SPACE_PATH } from '../chat/chatPlacePaths'
import { taskPath } from '../conversations/toolLink'
import type { CardPlace } from '../agents/profile/cardPlace'

/** Where the open conversation lives, for its place chip, and the list its thread starts a new one from. */
export interface DockPlace {
  kind: 'space' | 'project' | 'task'
  label: string
  /** The place itself, opened in the canvas from the chip. */
  href: string
  /** `ConversationThread`'s `listPath`. */
  listPath: string
  /** Where an agent's card in the thread offers what the person can do with the agent: the project, or their Chat. */
  card: CardPlace
}

const SPACE: DockPlace = {
  kind: 'space', label: 'Your space', href: SPACE_PATH, listPath: CHAT_PATH, card: { kind: 'chat', basePath: CHAT_PATH, path: SPACE_PATH },
}

function projectCard(projectId: string, path: string): CardPlace {
  return { kind: 'project', projectId, basePath: path, sessionLocation: { primaryOwnerType: 'project', primaryOwnerId: projectId }, path }
}

interface ProjectRef { key: string; name: string; personalSpace?: boolean }
interface TaskRef { title: string; number: number; project: { key: string } }

export function useDockPlace(view: ConversationView | undefined): DockPlace | null {
  const projectId = view?.home === 'PROJECT' ? view.projectId : null
  const taskId = view?.home === 'TASK' ? view.taskId : null
  const { data: project } = useQuery(getProject, { projectId: projectId ?? '' }, { enabled: !!projectId })
  const { data: task } = useQuery(getTask, { taskId: taskId ?? '' }, { enabled: !!taskId })
  if (!view) return null
  if (view.home === 'PERSON') return SPACE
  if (view.home === 'PROJECT') {
    const p: ProjectRef | undefined = project
    if (!p || !projectId) return null
    if (p.personalSpace) return SPACE
    const path = `/projects/${encodeURIComponent(p.key)}`
    return { kind: 'project', label: p.name, href: path, listPath: path, card: projectCard(projectId, path) }
  }
  const t: TaskRef | null | undefined = task
  if (!t) return null
  const path = taskPath(`${t.project.key}-${t.number}`)
  const card = view.projectId ? projectCard(view.projectId, `/projects/${encodeURIComponent(t.project.key)}`) : SPACE.card
  return { kind: 'task', label: t.title, href: path, listPath: path, card }
}
