/** The words every opened file says the same way, wherever it opens (the file viewer's *One header everywhere*). */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { FileOpenAnswer } from '@agenthix/core'
import { changedLabel } from '@agenthix/ui/projects'
import { modifiedMs } from '../../../shared/components/markdownEmbed/FileChip'

/** How long a word after an action stays under the actions. */
export const NOTICE_MS = 4000

/**
 * "Changed today 07:39": when the file the open answer describes was last changed, read from its version (`fileVersion`
 * is its size and modified time), so every place a file opens says it, not only the list it was picked from (S22).
 */
export function changedOfAnswer(answer: FileOpenAnswer | undefined, now = new Date()): string | undefined {
  if (!answer || (answer.state !== 'ready' && answer.state !== 'no-files-address')) return undefined
  const ms = modifiedMs(answer.facts.version)
  if (ms === null) return undefined
  const label = changedLabel(new Date(ms).toISOString(), now)
  if (/^\d\d:\d\d$/.test(label)) return `Changed today ${label}`
  return `Changed ${label === 'Yesterday' ? 'yesterday' : label}`
}

/** What Ask the agent puts in the message box for a file the agent should save again as an ordinary copy (D4). */
export function askToSaveAgain(reference: string): string {
  return `Please save ${reference} again as an ordinary copy.`
}

/** A file asked for by a path that names nothing there: said as such, never as a file that was deleted (S18). */
export function noFileAt(path: string, where: string): string {
  return `There's no file at ${path} in ${where}.`
}

export const GONE_WORDS = "This file isn't here any more."

/** A word after an action, cleared after a moment so the same word can be said again. */
export function useActionNotice(): [string, (words: string) => void] {
  const [notice, setNotice] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const say = useCallback((words: string) => {
    if (timer.current) clearTimeout(timer.current)
    setNotice(words)
    if (words) timer.current = setTimeout(() => setNotice(''), NOTICE_MS)
  }, [])
  return [notice, say]
}
