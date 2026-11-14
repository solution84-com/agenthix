import { useEffect, useState } from 'react'
import { useAction, setWebSearchKey, deleteWebSearchKey } from 'wasp/client/operations'
import { Button, ConfirmDialog, FormField, Input, Modal } from '@agenthix/ui/primitives'
import { ShowAttention } from '@agenthix/ui/attention'
import { splitFailure } from '../../settings/fieldFailure'
import { pressFailureWords } from '../../shared/failureWords'

export const EXA_KEY_PAGE = 'https://dashboard.exa.ai/api-keys'

export interface WebSearchKeyDialogProps {
  open: boolean
  /** `getWebSearchKeyStatus`'s `present`: a stored key is said so, never shown back. */
  stored: boolean
  onClose: () => void
}

/** HQ could not ask Exa, so the key was not checked (`setWebSearchKey`'s `not_checked`). */
const notChecked = (err: unknown) => (err as { data?: { data?: { code?: unknown } } } | null)?.data?.data?.code === 'not_checked'

/**
 * Web search for OpenCode: the organisation's Exa key, checked with Exa and saved through `setWebSearchKey`. A key Exa
 * refuses is said under the field and the pop-up stays open. When Exa did not answer, the attention dialog says the key
 * could not be checked and offers Save without checking; any other failure of the press is said there too. It never
 * blocks setup: Not now closes it.
 */
export function WebSearchKeyDialog({ open, stored, onClose }: WebSearchKeyDialogProps) {
  const save = useAction(setWebSearchKey)
  const remove = useAction(deleteWebSearchKey)
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [press, setPress] = useState<{ words: string; title: string; retry?: () => void; unchecked?: boolean } | null>(null)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  useEffect(() => { if (open) { setKey(''); setError(''); setPress(null); setAsking(false) } }, [open])

  const send = async (unchecked: boolean) => {
    setBusy('save'); setError(''); setPress(null)
    try {
      await save(unchecked ? { secret: key, unchecked: true } : { secret: key })
      setKey('')
      onClose()
    } catch (err) {
      const f = splitFailure(err, 'Could not save the key')
      setError(f.field)
      if (notChecked(err)) setPress({ words: f.press, title: 'The key was not checked', retry: () => void send(false), unchecked: true })
      else if (f.press) setPress({ words: f.press, title: 'The key was not saved', retry: () => void send(unchecked) })
    } finally {
      setBusy(null)
    }
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void send(false)
  }

  const removeKey = async () => {
    setAsking(false)
    setBusy('remove'); setError(''); setPress(null)
    try {
      await remove(undefined)
      onClose()
    } catch (err) {
      setPress({ words: pressFailureWords(err, 'Could not remove the key'), title: 'The key was not removed' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Web search for OpenCode">
        <form onSubmit={submit} className="space-y-4">
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
          <ShowAttention kind="alert" text={press?.words ?? ''} title={press?.title ?? ''} retry={press?.retry}
            actions={press?.unchecked ? [{ label: 'Save without checking', onClick: () => void send(true) }] : undefined}
            onClose={() => setPress(null)} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {stored && (
              <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => setAsking(true)} className="mr-auto text-danger not-disabled:hover:text-danger">
                {busy === 'remove' ? 'Removing…' : 'Remove key'}
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={onClose}>Not now</Button>
            <Button type="submit" disabled={busy !== null || !key.trim()}>{busy === 'save' ? 'Saving…' : 'Save key'}</Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog
        open={asking}
        title="Remove the search key?"
        description="Agents working in OpenCode stop searching the web until a key is added again."
        confirmLabel="Remove the key"
        destructive
        onConfirm={() => void removeKey()}
        onCancel={() => setAsking(false)}
      />
    </>
  )
}
