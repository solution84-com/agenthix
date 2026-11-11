import { useEffect, useState } from 'react'
import { BookmarkPlus, Check } from 'lucide-react'
import { Tooltip } from '@agenthix/ui/primitives'
import { addTaskComment } from 'wasp/client/operations'
import { threadLine, type ThreadNudges } from '../hooks/useThreadNudges'
import { refusalText } from '../../shared/refusal'
import { ANSWER_ICON } from './ListenButton'

/** What a task's conversation offers each message: saving its words to the task as a comment. */
export type SaveToTask = (text: string) => Promise<void>

/**
 * *Save to the task* (T0): in a task's conversation, a message — the person's or the agent's — becomes a comment
 * on the task, so what the chat decided is part of its record and the next run's brief. Saved, the icon says so for
 * a moment; a save that fails is a line after the thread's last message, with Try again.
 */
export function SaveToTaskButton({ text, onSave }: { text: string; onSave: SaveToTask }) {
  const [state, setState] = useState<'idle' | 'busy' | 'saved'>('idle')
  useEffect(() => {
    if (state !== 'saved') return
    const timer = setTimeout(() => setState('idle'), 2000)
    return () => clearTimeout(timer)
  }, [state])
  const label = state === 'saved' ? 'Saved to the task' : 'Save to the task'
  const save = async () => {
    setState('busy')
    try {
      await onSave(text)
      setState('saved')
    } catch {
      setState('idle')
    }
  }
  return (
    <Tooltip label={label} side="top">
      <button type="button" aria-label={label} disabled={state === 'busy' || !text.trim()} onClick={() => void save()} className={ANSWER_ICON}>
        {state === 'saved' ? <Check size={16} aria-hidden className="text-success" /> : <BookmarkPlus size={16} aria-hidden />}
      </button>
    </Tooltip>
  )
}

/** *Save to the task*: the message's words as the person's comment on the task; a refusal is a line in the thread, with Try again. */
export function saveToTask(taskId: string, push: ThreadNudges['push'], clear: ThreadNudges['clear']) {
  const save = async (text: string): Promise<void> => {
    try {
      await addTaskComment({ taskId, content: text.trim(), savedFromConversation: true })
      clear('save-to-task')
    } catch (err) {
      push({ key: 'save-to-task', text: threadLine('Could not save it to the task', refusalText(err)), retry: () => void save(text).catch(() => undefined) })
      throw err
    }
  }
  return save
}
