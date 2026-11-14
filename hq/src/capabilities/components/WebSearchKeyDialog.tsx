import { useEffect, useState } from 'react'
import { useAction, setWebSearchKey, deleteWebSearchKey } from 'wasp/client/operations'
import { Button, FormField, Input, Modal } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'
import { splitFailure } from '../../settings/fieldFailure'

export const EXA_KEY_PAGE = 'https://dashboard.exa.ai/api-keys'

export interface WebSearchKeyDialogProps {
  open: boolean
  /** `getWebSearchKeyStatus`'s `present`: a stored key is said so, never shown back. */
  stored: boolean
  onClose: () => void
}

/**
 * Web search for OpenCode: the organisation's Exa key, saved through `setWebSearchKey` as before. A refused key is said
 * under the field and the pop-up stays open; any other failure of the press is said by the attention dialog. It never
 * blocks setup: Not now closes it.
 */
export function WebSearchKeyDialog({ open, stored, onClose }: WebSearchKeyDialogProps) {
  const save = useAction(setWebSearchKey)
  const remove = useAction(deleteWebSearchKey)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [press, setPress] = useState<{ words: string; title: string } | null>(null)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  useEffect(() => { if (open) { setKey(''); setError(''); setPress(null) } }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy('save'); setError(''); setPress(null)
    try {
      await save({ secret: key })
      setKey('')
      onClose()
    } catch (err) {
      const f = splitFailure(err, 'Could not save the key')
      setError(f.field)
      if (f.press) setPress({ words: f.press, title: 'The key was not saved' })
    } finally {
      setBusy(null)
    }
  }

  const removeKey = async () => {
    setBusy('remove'); setError(''); setPress(null)
    try {
      await remove(undefined)
      onClose()
    } catch (err) {
      setPress({ words: err instanceof Error && err.message ? err.message : 'Could not remove the key', title: 'The key was not removed' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Web search for OpenCode">
      <form onSubmit={e => void submit(e)} className="space-y-4">
        <p className="text-small text-text-secondary">
          Agents working in OpenCode search the web through Exa, with your organisation’s key. The key stays in HQ and
          never reaches an agent. Runtimes that search on their own, like Claude Code, don’t need it.
        </p>
        {stored && <p className="text-small text-text-secondary">A key is saved. It is never shown again: enter a new one to replace it.</p>}
        <FormField label={stored ? 'New Exa API key' : 'Exa API key'} htmlFor="web-search-key" error={error}>
          <Input id="web-search-key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} />
        </FormField>
        <p className="text-small text-text-muted">
          No key yet? <a href={EXA_KEY_PAGE} target="_blank" rel="noopener noreferrer" className="font-medium text-link hover:underline">Get one from Exa ↗</a>: sign up, then copy the key from its dashboard.
        </p>
        <ShowAttention kind="alert" text={press?.words ?? ''} title={press?.title ?? ''} onClose={() => setPress(null)} />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {stored && (
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => void removeKey()} className="mr-auto text-danger not-disabled:hover:text-danger">
              {busy === 'remove' ? 'Removing…' : 'Remove key'}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onClose}>Not now</Button>
          <Button type="submit" disabled={busy !== null || !key.trim()}>{busy === 'save' ? 'Saving…' : 'Save key'}</Button>
        </div>
      </form>
    </Modal>
  )
}
