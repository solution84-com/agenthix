import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { changesBetween, treeRows } from './changeSet'
import { checkSkill, hasError } from './editorChecks'
import {
  filesOfData, renamedFile, sameFiles, saveInput, withFile, withoutFile, type EditorFile,
} from './editorFiles'
import type { EditorApi } from './useEditorApi'
import type { EditorView } from './editorTypes'
import type { FileChange } from '@agenthix/ui/files'

export type EditorMode = 'view' | 'edit' | 'changes'

const words = (err: unknown) => (err instanceof Error ? err.message : 'That did not work. Nothing was changed.')

/**
 * What a person is doing in the editor: the working copy of the skill's files, the file open and its mode, saving the
 * draft, and noticing when the draft moved under them (an agent or a colleague saved). The server's draft is the
 * truth; the working copy is adopted from it whenever the person has nothing unsaved.
 */
export function useEditorState(view: EditorView, api: EditorApi, reload: () => Promise<unknown>) {
  const server = useMemo(() => filesOfData(view.files), [view.files])
  const base = useMemo(() => filesOfData(view.base), [view.base])
  const [files, setFiles] = useState<EditorFile[]>(server)
  const [renames, setRenames] = useState<Map<string, string>>(new Map())
  const [selected, setSelected] = useState<string | null>(() => (server.some(f => f.path === 'SKILL.md') ? 'SKILL.md' : server[0]?.path ?? null))
  const [mode, setMode] = useState<EditorMode>('view')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [moved, setMoved] = useState(false)
  const working = useRef(files)
  working.current = files
  const loaded = useRef({ files: server, revision: view.revision })

  useEffect(() => {
    if (sameFiles(server, loaded.current.files) && view.revision === loaded.current.revision) return
    if (sameFiles(working.current, loaded.current.files)) {
      setFiles(server)
      setMoved(false)
    } else if (!sameFiles(working.current, server)) {
      setMoved(true)
    }
    loaded.current = { files: server, revision: view.revision }
  }, [server, view.revision])

  const dirty = !sameFiles(files, server)
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
    setSaving(true)
    setError('')
    try {
      await api.save(saveInput(working.current), loaded.current.revision)
      await reload()
      return true
    } catch (err) {
      setError(words(err))
      return false
    } finally {
      setSaving(false)
    }
  }, [api, reload])

  const reloadFromServer = useCallback(() => {
    setFiles(server)
    setRenames(new Map())
    setMoved(false)
    setError('')
  }, [server])

  return {
    files, base, rows, changes, checks, blocked: hasError(checks), dirty, moved, saving, error, setError,
    selected, current, gone, select: setSelected, mode, setMode,
    edit, add, remove, rename, undo, save, reloadFromServer,
  }
}

export type EditorState = ReturnType<typeof useEditorState>
