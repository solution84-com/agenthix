import { useId, useState } from 'react'
import { useQuery, useAction, getWebSearchKeyStatus, setWebSearchKey, deleteWebSearchKey } from 'wasp/client/operations'
import { CARD, CardHeading, INPUT, useCredentialCall } from './modelAccessParts'
import { Button } from '@agenthix/ui/primitives'
import { ShowAttention, useBackgroundRead } from '@agenthix/ui/attention'

/** The org's Exa key, for web search by agents on OpenCode. Admins only; never shown back. */
export function WebSearchKeyBlock() {
  const query = useQuery(getWebSearchKeyStatus)
  const { data: status, isLoading } = query
  const read = useBackgroundRead(query, { what: 'The web search key' })
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
      {read.nudge}
      {isLoading ? (
        <p className="text-text-muted text-body">Loading…</p>
      ) : !status ? null : status.present ? (
        <div className="flex items-center gap-3">
          <span className="text-body text-text-primary">A key is stored.</span>
          <Button type="button" disabled={busy} onClick={() => void run(() => remove(undefined))} variant="ghost" className="text-danger not-disabled:hover:text-danger">
            Remove key
          </Button>
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
          <Button type="submit" disabled={busy || !key.trim()}>
            {busy ? 'Saving…' : 'Save key'}
          </Button>
        </form>
      )}
      <ShowAttention kind="alert" text={problem} title="The key was not changed" />
    </div>
  )
}
