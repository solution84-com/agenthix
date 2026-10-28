import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { changesBetween, treeRows } from './changeSet'
import { checkSkill, hasError } from './editorChecks'
import {
  filesOfData, renamedFile, sameFiles, saveInput, withFile, withoutFile, type EditorFile,
} from './editorFiles'
import type { EditorApi } from './useEditorApi'
import type { EditorView } from './editorTypes'
import type { FileChange } from '@agenthix/ui/files'
import { AUTOSAVE_MS } from './editorWords'

export type EditorMode = 'view' | 'edit' | 'changes'

const words = (err: unknown) => (err instanceof Error ? err.message : 'That did not work. Nothing was changed.')

/**
 * What a person is doing in the editor: the working copy of the skill's files, the file open and its mode, the draft
 * saving itself a moment after the person stops typing, and noticing when the draft moved under them (an agent or a
 * colleague saved). The server's draft is the truth; the working copy is adopted from it whenever the person has
 * nothing unsaved. Saving waits while the draft has moved, so a colleague's change is never saved over unasked.
 */
export function useEditorState(view: EditorView, api: EditorApi, reload: () => Promise<unknown>) {
  const server = useMemo(() => filesOfData(view.files), [view.files])
  const base = useMemo(() => filesOfData(view.base), [view.base])
  const [files, setFiles] = useState<EditorFile[]>(server)
  // What the server holds as far as this editor knows: the draft loaded, or what this editor last saved.
  const [saved, setSaved] = useState<EditorFile[]>(server)
  const [renames, setRenames] = useState<Map<string, string>>(new Map())
  const [selected, setSelected] = useState<string | null>(() => (server.some(f => f.path === 'SKILL.md') ? 'SKILL.md' : server[0]?.path ?? null))
  const [mode, setMode] = useState<EditorMode>('view')
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState<{ files: EditorFile[]; text: string } | null>(null)
  const [error, setError] = useState('')
  const [moved, setMoved] = useState(false)
  const working = useRef(files)
  working.current = files
  const loaded = useRef({ files: server, revision: view.revision })
  const inFlight = useRef(false)
  // The page hands a new reload on every render; the latest is used, so it never restarts the pause before a save.
  const reloadLatest = useRef(reload)
  reloadLatest.current = reload
  const [settled, setSettled] = useState(0)

  // The last read looked at, so a save settling never compares the work with a read from before it.
  const seen = useRef<{ server: EditorFile[]; revision: number | null }>({ server, revision: view.revision })

  useEffect(() => {
    // A read that lands while a save and its reload are in flight is looked at once they settle.
    if (inFlight.current) return
    if (seen.current.server === server && seen.current.revision === view.revision) return
    seen.current = { server, revision: view.revision }
    if (sameFiles(server, loaded.current.files) && view.revision === loaded.current.revision) return
    if (sameFiles(working.current, loaded.current.files)) {
      setFiles(server)
      setMoved(false)
    } else if (!sameFiles(working.current, server)) {
      setMoved(true)
    }
    loaded.current = { files: server, revision: view.revision }
    setSaved(server)
  }, [server, view.revision, settled])

  const dirty = !sameFiles(files, saved)
  const changes = useMemo(() => changesBetween(base, files, renames), [base, files, renames])
  const rows = useMemo(() => treeRows(base, files, renames), [base, files, renames])
  const checks = useMemo(() => checkSkill(view.name, files), [view.name, files])
  const current = files.find(f => f.path === selected) ?? null
  const gone = selected !== null && !current ? changes.find(c => c.path === selected && c.status === 'removed') ?? null : null

  const edit = useCallback((file: EditorFile) => setFiles(prev => withFile(prev, file)), [])
  const add = useCallback((file: EditorFile) => { setFiles(prev => withFile(prev, file)); setSelected(file.path); setMode('edit') }, [])
  const remove = useCallback((path: string) => {
    setFiles(prev => withoutFile(prev, path))
    setSelected(s => (s === path ? null : s))
  }, [])
  const rename = useCallback((from: string, to: string) => {
    setFiles(prev => renamedFile(prev, from, to))
    setRenames(prev => {
      const next = new Map(prev)
      const origin = next.get(from) ?? from
      next.delete(from)
      next.set(to, origin)
      return next
    })
    setSelected(to)
  }, [])

  /** Puts one file back as it is in the version in use: *Undo this file's changes*, and *Restore* for a deleted one. */
  const undo = useCallback((change: FileChange) => {
    const original = change.status === 'renamed' ? change.oldPath! : change.path
    const bytes = base.find(f => f.path === original)?.bytes
    setFiles(prev => {
      let next = withoutFile(prev, change.path)
      if (bytes) next = withFile(next, { path: original, bytes })
      return next
    })
    setRenames(prev => { const next = new Map(prev); next.delete(change.path); return next })
    setSelected(s => (s === change.path ? (bytes ? original : null) : s))
  }, [base])

  const save = useCallback(async (): Promise<boolean> => {
    const sending = working.current
    inFlight.current = true
    setSaving(true)
    try {
      const { revision } = await api.save(saveInput(sending), loaded.current.revision)
      loaded.current = { files: sending, revision }
      setSaved(sending)
      setFailed(null)
      setMoved(false)
      // Publish names the revision the view holds, so saving lasts until the view has this one.
      await reloadLatest.current().catch(() => undefined)
      return true
    } catch (err) {
      setFailed({ files: sending, text: words(err) })
      await reloadLatest.current().catch(() => undefined)
      return false
    } finally {
      inFlight.current = false
      setSaving(false)
      setSettled(n => n + 1)
    }
  }, [api])

  // A change saves itself once the person pauses; a refused save is tried again only after the next change.
  const waiting = dirty && view.editsHere && !moved && !saving && failed?.files !== files
  useEffect(() => {
    if (!waiting) return
    const timer = window.setTimeout(() => { void save() }, AUTOSAVE_MS)
    return () => window.clearTimeout(timer)
  }, [waiting, files, save])

  const reloadFromServer = useCallback(() => {
    setFiles(server)
    setSaved(server)
    loaded.current = { files: server, revision: view.revision }
    setRenames(new Map())
    setMoved(false)
    setFailed(null)
    setError('')
  }, [server, view.revision])

  return {
    files, base, rows, changes, checks, blocked: hasError(checks), dirty, moved, saving, failed: failed?.text ?? null, error, setError,
    selected, current, gone, select: setSelected, mode, setMode,
    edit, add, remove, rename, undo, save, reloadFromServer,
  }
}

export type EditorState = ReturnType<typeof useEditorState>
