import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SHARED_FILE_MAX_BYTES, SHARED_FILES_PER_MESSAGE, SHARED_IMAGE_MIMES, SHARED_KINDS_WORDS, SHARED_PICKER_ACCEPT,
  type SharedFile, type SharedFileKind,
} from '@agenthix/core'
import { actionErrorText } from './threadState'

/** One photo or file in the message box's tray: what was picked, and once kept, what HQ kept it as. */
export type TrayItem = {
  id: string
  file: File
  kind: SharedFileKind
  /** A picture's preview in this browser, until it is sent or removed. */
  preview: string | null
  state: 'waiting' | 'keeping' | 'kept' | 'failed'
  kept?: SharedFile
  error?: string
}

const IMAGES: readonly string[] = SHARED_IMAGE_MIMES
const EXTS = SHARED_PICKER_ACCEPT.split(',').filter(a => a.startsWith('.'))

/** Whether the browser's guess at a file is one HQ may keep; HQ checks the bytes again either way. */
export function mayBeShared(file: Pick<File, 'name' | 'type'>): SharedFileKind | null {
  if (IMAGES.includes(file.type)) return 'image'
  if (file.type === 'application/pdf' || file.type.startsWith('text/')) return 'file'
  const name = file.name.toLowerCase()
  return EXTS.some(e => name.endsWith(e)) || name.endsWith('.pdf') ? 'file' : null
}

export const refusedWords = (name: string) => `${name} can't be added: ${SHARED_KINDS_WORDS.replace(/^Photos/, 'photos')}.`
export const TOO_MANY = `A message carries at most ${SHARED_FILES_PER_MESSAGE} photos or files.`

function dataUrlOf(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("The file couldn't be read."))
    reader.readAsDataURL(file)
  })
}

export type ShareOne = (args: { conversationId: string; name: string; dataUrl: string }) => Promise<SharedFile>

let next = 0

/**
 * The photos and files added to the message box before it is sent: picked, pasted or dropped, checked here for kind and
 * size, shown in the tray, kept in the place by HQ when Send is pressed (each once, so a retry keeps none again), and
 * cleared once the message is sent. A refusal is said once, under the tray, until the next change.
 */
export function useSharedFiles(conversationId: string, share: ShareOne) {
  const [items, setItems] = useState<TrayItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const latest = useRef(items)
  latest.current = items

  // A preview is the browser's to let go once nothing shows it.
  useEffect(() => () => { for (const i of latest.current) if (i.preview) URL.revokeObjectURL(i.preview) }, [])

  const add = useCallback((files: File[]) => {
    const refused: string[] = []
    const added: TrayItem[] = []
    for (const file of files) {
      const kind = mayBeShared(file)
      if (!kind || file.size > SHARED_FILE_MAX_BYTES || file.size === 0) { refused.push(refusedWords(file.name || 'That file')); continue }
      added.push({ id: `shared-${next++}`, file, kind, preview: kind === 'image' ? URL.createObjectURL(file) : null, state: 'waiting' })
    }
    const room = SHARED_FILES_PER_MESSAGE - latest.current.length
    if (added.length > room) {
      for (const dropped of added.splice(Math.max(0, room))) if (dropped.preview) URL.revokeObjectURL(dropped.preview)
      refused.push(TOO_MANY)
    }
    setNotice(refused.length > 0 ? refused.join(' ') : null)
    if (added.length > 0) setItems(now => [...now, ...added])
  }, [])

  const remove = useCallback((id: string) => {
    setNotice(null)
    setItems(now => {
      const gone = now.find(i => i.id === id)
      if (gone?.preview) URL.revokeObjectURL(gone.preview)
      return now.filter(i => i.id !== id)
    })
  }, [])

  const update = (id: string, patch: Partial<TrayItem>) => setItems(now => now.map(i => (i.id === id ? { ...i, ...patch } : i)))

  /** Keeps each file not yet kept, in order; every one kept, or null when one could not be (it says why). */
  const keepAll = useCallback(async (): Promise<SharedFile[] | null> => {
    const kept: SharedFile[] = []
    for (const item of latest.current) {
      if (item.kept) { kept.push(item.kept); continue }
      update(item.id, { state: 'keeping', error: undefined })
      try {
        const file = await share({ conversationId, name: item.file.name, dataUrl: await dataUrlOf(item.file) })
        update(item.id, { state: 'kept', kept: file })
        kept.push(file)
      } catch (err) {
        update(item.id, { state: 'failed', error: actionErrorText(err, `${item.file.name} couldn't be added.`) })
        return null
      }
    }
    return kept
  }, [conversationId, share])

  const clear = useCallback(() => {
    for (const i of latest.current) if (i.preview) URL.revokeObjectURL(i.preview)
    setItems([])
    setNotice(null)
  }, [])

  return {
    items, notice, add, remove, keepAll, clear,
    keeping: items.some(i => i.state === 'keeping'),
    hasImage: items.some(i => i.kind === 'image'),
  }
}

export type SharedFiles = ReturnType<typeof useSharedFiles>
