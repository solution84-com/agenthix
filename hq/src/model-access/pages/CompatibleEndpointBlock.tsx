import { useId, useState } from 'react'
import { useAction, setModelCredential } from 'wasp/client/operations'
import { COMPATIBLE_ENDPOINT } from '../../shared/modelProviders'
import { BUTTON, CancelButton, INPUT, useCredentialCall, type BlockProps } from './modelAccessParts'

const provider = COMPATIBLE_ENDPOINT

/**
 * An OpenAI-compatible endpoint — Ollama, LM Studio, a self-hosted server: its
 * base URL, and a key only if the endpoint needs one. The key is never shown back.
 */
export function CompatibleEndpointBlock({ ownerType, ownerId, onSaved, onCancel }: BlockProps & { onSaved: () => void; onCancel: () => void }) {
  const save = useAction(setModelCredential)
  const { busy, problem, run } = useCredentialCall()
  const [baseUrl, setBaseUrl] = useState('')
  const [key, setKey] = useState('')
  const urlId = useId()
  const keyId = useId()

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        void run(() => save({ ownerType, ownerId, kind: 'API_KEY', provider, baseUrl, secret: key })).then(ok => {
          if (!ok) return
          setBaseUrl('')
          setKey('')
          onSaved()
        })
      }}
      className="space-y-3"
    >
      <p className="text-small text-text-secondary">
        A model server of your own that speaks the OpenAI API. The key is needed only if the server asks for one.
      </p>
      <label htmlFor={urlId} className="sr-only">Base URL</label>
      <input id={urlId} type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" className={`${INPUT} w-full`} />
      <label htmlFor={keyId} className="sr-only">Endpoint key (optional)</label>
      <input id={keyId} type="password" value={key} onChange={e => setKey(e.target.value)} placeholder="Key, if the endpoint needs one" className={`${INPUT} w-full`} />
      {problem && <p role="alert" className="text-small text-danger">{problem}</p>}
      <div className="flex justify-end gap-2">
        <CancelButton onClick={onCancel} />
        <button type="submit" disabled={busy || !baseUrl.trim()} className={BUTTON}>{busy ? 'Saving…' : 'Save endpoint'}</button>
      </div>
    </form>
  )
}
