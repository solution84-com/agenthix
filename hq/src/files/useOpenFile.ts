import { useCallback, useEffect, useRef, useState } from 'react'
import { openFile } from 'wasp/client/operations'
import type { FileOpenAnswer, SiteFileRef } from '@agenthix/core'
import { embedKey } from '../shared/components/markdownEmbed/embedTarget'

/** How long before its tickets end an open file is opened again, so Download and later reads keep working. */
export const RENEW_BEFORE_MS = 20_000

export type OpenOne = (ref: SiteFileRef) => Promise<FileOpenAnswer>

const openThroughHq: OpenOne = async file => (await openFile({ file })) as FileOpenAnswer

type Opened = { key: string; answer?: FileOpenAnswer; error?: Error }

/**
 * An open let go by a screen that stopped showing its file, kept only until React has finished the commit that let it
 * go: the screen that shows the same file in that commit — the same frame moved by a layout change, or mounted twice in
 * development — takes it over instead of signing and recording another pair of tickets. A file selected again later
 * opens afresh.
 */
const letGo = new Map<string, Promise<FileOpenAnswer>>()

function takeOver(key: string): Promise<FileOpenAnswer> | undefined {
  const opening = letGo.get(key)
  letGo.delete(key)
  return opening
}

function letGoOf(key: string, opening: Promise<FileOpenAnswer>) {
  letGo.set(key, opening)
  queueMicrotask(() => { if (letGo.get(key) === opening) letGo.delete(key) })
}

/**
 * The open answer for the selected file (adr-0153): asked for once per selection, however often the screen mounts or
 * moves it, again on Try again or Show the new version, and again shortly before its tickets end — then only while the
 * page is being looked at, so a tab left open in the background does not sign and record a ticket every few minutes. A
 * renewal keeps the old answer on screen until the new one arrives.
 */
export function useOpenFile(ref: SiteFileRef | null, open: OpenOne = openThroughHq) {
  return useOpenAnswer(ref ? embedKey(ref) : '', ref ? () => open(ref) : null)
}

/**
 * The same, for any file the caller opens its own way (a task's attachment): `key` names the file, and a new key
 * opens it afresh; `open` is null while nothing is selected.
 */
export function useOpenAnswer(key: string, open: (() => Promise<FileOpenAnswer>) | null) {
  const latest = useRef(open)
  latest.current = open
  const selected = open !== null
  const [opened, setOpened] = useState<Opened>({ key: '' })
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!selected || !latest.current) return
    let current = true
    setOpened(o => (o.key === key ? { key, answer: o.answer } : { key }))
    // Try again, Show the new version and a renewal always ask HQ; only a screen's first open takes one over.
    const opening = (round === 0 ? takeOver(key) : undefined) ?? latest.current()
    opening.then(
      answer => { if (current) setOpened({ key, answer }) },
      (error: unknown) => {
        if (current) setOpened({ key, error: error instanceof Error ? error : new Error("HQ couldn't open this file.") })
      },
    )
    return () => {
      current = false
      letGoOf(key, opening)
    }
    // The file is named by `key`: a new opener for the same file opens nothing new.
  }, [key, round, selected])

  const answer = opened.key === key ? opened.answer : undefined
  const expiresAt = answer && 'expiresAt' in answer ? answer.expiresAt : undefined
  useEffect(() => {
    if (expiresAt === undefined) return
    const renew = () => setRound(r => r + 1)
    let waiting: (() => void) | null = null
    const timer = setTimeout(() => {
      if (document.visibilityState !== 'hidden') { renew(); return }
      waiting = () => {
        if (document.visibilityState === 'hidden') return
        document.removeEventListener('visibilitychange', waiting!)
        renew()
      }
      document.addEventListener('visibilitychange', waiting)
    }, Math.max(0, expiresAt - RENEW_BEFORE_MS - Date.now()))
    return () => {
      clearTimeout(timer)
      if (waiting) document.removeEventListener('visibilitychange', waiting)
    }
  }, [expiresAt])

  const reopen = useCallback(() => {
    setOpened({ key })
    setRound(r => r + 1)
  }, [key])

  return { answer, error: opened.key === key ? opened.error : undefined, reopen }
}
