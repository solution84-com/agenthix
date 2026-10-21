import { useId, useState } from 'react'
import { useAction, setModelCredential } from 'wasp/client/operations'
import { PROVIDER_LABELS, type CredentialProvider } from '../../shared/modelProviders'
import { BUTTON, CancelButton, INPUT, useCredentialCall, type BlockProps } from './modelAccessParts'

export type KeyProvider = Exclude<CredentialProvider, 'openai_compatible'>

const USE: Record<KeyProvider, string> = {
  anthropic: 'For Claude models, for everyone in the organisation.',
  openrouter: 'One key reaches many models, free ones included.',
  openai: 'For OpenAI\'s GPT models.',
  google: 'For Google\'s Gemini models.',
}

const PLACEHOLDER: Record<KeyProvider, string> = {
  anthropic: 'sk-ant-...',
  openrouter: 'sk-or-...',
  openai: 'sk-...',
  google: 'AIza...',
}

/** One provider's API key field, with Save and Cancel; the key itself is never shown back. */
export function ProviderKeyBlock({ ownerType, ownerId, provider, onSaved, onCancel }: BlockProps & { provider: KeyProvider; onSaved: () => void; onCancel: () => void }) {
  const save = useAction(setModelCredential)
  const { busy, problem, run } = useCredentialCall()
  const [key, setKey] = useState('')
  const inputId = useId()
  const label = `${PROVIDER_LABELS[provider]} API key`

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        void run(() => save({ ownerType, ownerId, kind: 'API_KEY', provider, secret: key })).then(ok => { if (ok) { setKey(''); onSaved() } })
      }}
      className="space-y-3"
    >
      <p className="text-small text-text-secondary">{USE[provider]}</p>
      <label htmlFor={inputId} className="sr-only">{label}</label>
      <input id={inputId} type="password" value={key} onChange={e => setKey(e.target.value)} placeholder={PLACEHOLDER[provider]} className={`${INPUT} w-full`} />
      {problem && <p role="alert" className="text-small text-danger">{problem}</p>}
      <div className="flex justify-end gap-2">
        <CancelButton onClick={onCancel} />
        <button type="submit" disabled={busy || !key.trim()} className={BUTTON}>{busy ? 'Saving…' : 'Save key'}</button>
      </div>
    </form>
  )
}
