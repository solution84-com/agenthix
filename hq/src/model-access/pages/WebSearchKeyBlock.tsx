import { useId, useState } from 'react'
import { useQuery, useAction, getWebSearchKeyStatus, setWebSearchKey, deleteWebSearchKey } from 'wasp/client/operations'
import { BUTTON, CARD, CardHeading, INPUT, REMOVE, useCredentialCall } from './modelAccessParts'

/** The org's Exa key, for web search by agents on OpenCode. Admins only; never shown back. */
export function WebSearchKeyBlock() {
  const { data: status, isLoading } = useQuery(getWebSearchKeyStatus)
  const save = useAction(setWebSearchKey)
  const remove = useAction(deleteWebSearchKey)
  const { busy, problem, run } = useCredentialCall()
  const [key, setKey] = useState('')
  const inputId = useId()

  return (
    <div className={CARD}>
      <CardHeading title="Web search (Exa)">
        Agents on OpenCode search the web through the Execution Site, which sends their queries to Exa with this
        key. The key never enters an agent's container. Claude models search on Anthropic's own service and do
        not use it.
      </CardHeading>
      {isLoading ? (
        <p className="text-text-muted text-body">Loading…</p>
      ) : status?.present ? (
        <div className="flex items-center gap-3">
          <span className="text-body text-text-primary">A key is stored.</span>
          <button type="button" disabled={busy} onClick={() => void run(() => remove(undefined))} className={REMOVE}>
            Remove key
          </button>
        </div>
      ) : (
        <form
          onSubmit={e => {
            e.preventDefault()
            void run(() => save({ secret: key })).then(ok => ok && setKey(''))
          }}
          className="flex items-center gap-2"
        >
          <label htmlFor={inputId} className="sr-only">Exa API key</label>
          <input
            id={inputId}
            type="password"
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="Exa API key"
            className={INPUT}
          />
          <button type="submit" disabled={busy || !key.trim()} className={BUTTON}>
            {busy ? 'Saving…' : 'Save key'}
          </button>
        </form>
      )}
      {problem && <p className="text-small text-danger">{problem}</p>}
    </div>
  )
}
