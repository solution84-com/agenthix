/**
 * What chips naming a task, or one of a task's files, show (spec part 3, *Chips in conversations › Tasks and their
 * files*). A task is found by its key or id across the organisation, then the person's access is checked as the task
 * page checks it (a member of its project); no such task and a task they may not see are one answer, `not-found`, so
 * a chip never shows the title of a task the person can't see. A working file's facts are a file's
 * (`fileFacts`: the place's access rule, then the site); an attachment's are read on hq's disk after `/file-link`'s
 * access rule. Nothing is signed and nothing is recorded: a click opens through `openFile` or `openTaskAttachment`.
 */
import type { LocationRef, SiteFileRef } from '@agenthix/core'
import type { TaskReference } from '../shared/taskReferences'
import type { FileFactsAnswer } from './fileFactsAnswer'
import type { TaskFacts, TaskReferenceAnswer } from './taskReferenceAnswer'
import { atFewAtOnce } from './openFiles'

export type FoundTask = TaskFacts & { projectId: string; yourSpace: boolean }
export type FoundAttachment = { id: string; uploadPath: string; name: string }

export interface TaskReferenceDeps {
  /** By key (`MOP-1`) or id; null when there is none. */
  findTask(task: string): Promise<FoundTask | null>
  /** Whether the person may see the project's tasks: the task page's own rule. */
  canSee(projectId: string, userId: string): Promise<boolean>
  /** Facts of files in places, through the one chip facts path. */
  fileFacts(refs: SiteFileRef[], userId: string): Promise<FileFactsAnswer[]>
  /** The task's attachment by that name, the newest when several share it. */
  findAttachment(taskId: string, name: string): Promise<FoundAttachment | null>
  attachmentFacts(attachment: FoundAttachment, userId: string): Promise<FileFactsAnswer>
}

/** The task's own folder (`tasks/<task>/`): none for a task of Your space, which runs in its person's storage. */
export function taskFolder(task: FoundTask): LocationRef | null {
  return task.yourSpace ? null : { ownerType: 'project', ownerId: task.projectId, workspaceId: null, taskId: task.id }
}

const factsOf = ({ id, key, title, status }: FoundTask): TaskFacts => ({ id, key, title, status })

export async function taskReferenceFacts(refs: TaskReference[], userId: string, deps: TaskReferenceDeps): Promise<TaskReferenceAnswer[]> {
  const seen = new Map<string, Promise<FoundTask | null>>()
  const visible = (name: string) => {
    let found = seen.get(name)
    if (!found) {
      found = deps.findTask(name).then(async t => (t && (await deps.canSee(t.projectId, userId)) ? t : null))
      seen.set(name, found)
    }
    return found
  }

  const answers: TaskReferenceAnswer[] = new Array(refs.length)
  const working: { i: number; task: FoundTask; loc: LocationRef; path: string }[] = []
  await atFewAtOnce(refs, async (ref, i) => {
    const task = await visible(ref.task)
    if (!task) { answers[i] = { state: 'not-found' }; return }
    const facts = factsOf(task)
    if (ref.kind === 'task') { answers[i] = { state: 'task', task: facts }; return }
    if (ref.kind === 'working') {
      const loc = taskFolder(task)
      if (loc) working.push({ i, task, loc, path: ref.path })
      else answers[i] = { state: 'working', task: facts, loc: null, path: ref.path, file: { state: 'not-found' } }
      return
    }
    const attachment = await deps.findAttachment(task.id, ref.name)
    answers[i] = {
      state: 'attachment', task: facts, attachmentId: attachment?.id ?? null,
      file: attachment ? await deps.attachmentFacts(attachment, userId) : { state: 'gone' },
    }
  })

  if (working.length > 0) {
    const files = await deps.fileFacts(working.map(w => ({ space: 'place', loc: w.loc, path: w.path })), userId)
    working.forEach((w, n) => {
      answers[w.i] = { state: 'working', task: factsOf(w.task), loc: w.loc, path: w.path, file: files[n] ?? { state: 'site-unavailable' } }
    })
  }
  return answers
}
