/**
 * A task, or one of its files, named in a conversation (spec part 3, *Chips in conversations › Tasks and their files*):
 * `tasks/MOP-1` is the task — its key, title and status, a click opens it; `tasks/MOP-1/notes.md` and
 * `attachments/MOP-1/a.png` are its files — the same chip a file has, a click opens it beside the thread. Until its
 * facts arrive, and for a task the person can't see, the reference stays plain text: never the task's title.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { SquareCheck } from 'lucide-react'
import type { TaskReferenceAnswer } from '../../../files/taskReferenceAnswer'
import { taskPath } from '../../../conversations/toolLink'
import { writeTaskReference, type TaskReference } from '../../taskReferences'
import { createKeyedBatch } from './embedBatch'
import type { MarkdownEmbedContext } from './embedTarget'
import { ChangedSince, changedSince, ChipInner, CHIP, chipFacts } from './FileChip'
import { useSeen } from './useEmbedAnswer'

type TaskBatch = { open(ref: TaskReference): Promise<TaskReferenceAnswer> }

let live: TaskBatch | null = null
function liveBatch(): TaskBatch {
  live ??= createKeyedBatch<TaskReference, TaskReferenceAnswer>(writeTaskReference, async refs => {
    const { getTaskReferenceFacts } = await import('wasp/client/operations')
    return (await getTaskReferenceFacts({ references: refs.map(writeTaskReference) })).answers as TaskReferenceAnswer[]
  })
  return live
}

/** The batch task chips ask through; tests give their own. */
export const TaskChipFactsContext = createContext<TaskBatch | null>(null)

export const STATUS_WORDS: Record<string, string> = { TODO: 'To do', IN_PROGRESS: 'In progress', DONE: 'Done' }

function useTaskChipFacts(ref: TaskReference) {
  const batch = useContext(TaskChipFactsContext) ?? liveBatch()
  const [seen, observe] = useSeen()
  const [answer, setAnswer] = useState<TaskReferenceAnswer>()
  const key = writeTaskReference(ref)
  useEffect(() => {
    if (!seen) return
    let current = true
    setAnswer(undefined)
    void batch.open(ref).then(a => { if (current) setAnswer(a) })
    return () => { current = false }
    // `ref` is named by `key`.
  }, [batch, key, seen])
  return { answer, observe }
}

export function TaskChip({ taskRef, reference, context }: { taskRef: TaskReference; reference: string; context: MarkdownEmbedContext }) {
  const { answer, observe } = useTaskChipFacts(taskRef)
  let body: ReactNode = reference
  if (answer?.state === 'task') {
    const { task } = answer
    body = (
      <a href={taskPath(task.key)} data-embed="task-chip" className={`${CHIP} hover:text-accent-hover`}>
        <SquareCheck size={13} aria-hidden className="shrink-0" />
        <span className="shrink-0 font-medium">{task.key}</span>
        <span className="min-w-0 truncate">{task.title}</span>{' '}
        <span className="shrink-0 text-micro text-text-muted">{STATUS_WORDS[task.status] ?? task.status}</span>
      </a>
    )
  } else if (answer?.state === 'working' || answer?.state === 'attachment') {
    const name = answer.state === 'working' ? answer.path.split('/').pop() || answer.path : (taskRef.kind === 'attachment' ? taskRef.name : '')
    const facts = answer.file.state === 'ready' ? answer.file.facts : undefined
    const { Icon, kind } = chipFacts(name, facts)
    const gone = answer.file.state === 'gone' || answer.file.state === 'not-found'
    const file = answer.state === 'working'
      ? answer.file.state === 'ready' && answer.loc ? { kind: 'working' as const, path: answer.path } : null
      : answer.attachmentId && answer.file.state === 'ready' ? { kind: 'attachment' as const, id: answer.attachmentId } : null
    const loc = answer.state === 'working' ? answer.loc : null
    const open = context.onOpenTaskFile && file
      ? () => context.onOpenTaskFile!({ taskId: answer.task.id, taskKey: answer.task.key, loc, file })
      : null
    const className = `${CHIP} ${gone ? 'line-through decoration-text-muted' : ''}`
    const inner = <ChipInner Icon={Icon} label={name} kind={kind} />
    body = <>
      {open
        ? <button type="button" data-embed="task-file-chip" title={`${answer.task.key} · ${reference}`} className={`${className} hover:text-accent-hover`} onClick={open}>{inner}</button>
        : <span data-embed="task-file-chip" data-gone={gone || undefined} title={reference} className={className}>{inner}</span>}
      {changedSince(facts, context.writtenAt) && <ChangedSince />}
    </>
  }
  return <span ref={observe}>{body}</span>
}
