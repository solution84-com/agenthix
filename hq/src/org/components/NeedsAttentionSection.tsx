import { useState } from 'react'
import { Link } from 'react-router'
import { useQuery, useAction, getNeedsAttention, getMyModelAccess, acknowledgeBypassedAgents, dismissNotification } from 'wasp/client/operations'
import { OrgGroupHeading } from './orgCardParts'
import { PROVIDERS_URL } from '../../admin/aiPage'
import { ReadFailedLine } from '../../shared/siteRead'
import { BUTTON_SECONDARY } from '@agenthix/ui/primitives'
import { useAttentionWhen, useBackgroundRead } from '@agenthix/ui/attention'

/**
 * No working model, and voice never set up, are read from what is stored each time, not kept as notifications: each
 * clears the moment it is set. A voice provider that was added and stopped working has its own notice.
 */
const ACCESS_ITEM = {
  area: 'infrastructure', actionLabel: 'Open AI', actionUrl: PROVIDERS_URL, notificationIds: [] as string[],
  dismissible: false, acknowledgeable: false,
}
const MODEL_ACCESS_ITEM = { ...ACCESS_ITEM, key: 'model-access', type: 'model_access', title: "Agents can't answer yet" }
const MODEL_BODY = { added: 'No model provider is working: add one, or fix the one there is', none: 'No model provider has been added. Add one so agents can think' }
const VOICE_ITEM = {
  ...ACCESS_ITEM, key: 'voice-setup', type: 'voice_setup', title: "Voice isn't set up",
  body: 'People can type to agents but not talk to them. Add a speech-to-text and a text-to-speech provider',
}

type AccessFacts = { canTalk: boolean; fix: string | null; added: { model: boolean; voice: boolean } }

/** The items read from the organisation's providers, before the stored notices. */
function accessItems(access: AccessFacts) {
  const model = !access.canTalk && access.fix === 'org-access' ? [{ ...MODEL_ACCESS_ITEM, body: access.added.model ? MODEL_BODY.added : MODEL_BODY.none }] : []
  return [...model, ...(access.added.voice ? [] : [VOICE_ITEM])]
}

const ACTION = `shrink-0 px-2.5 py-1 text-small rounded-lg font-medium ${BUTTON_SECONDARY}`

/**
 * Needs attention (every screen reviewed spec §3, Organisation), for admins: one list across the workplace and the
 * infrastructure, each item with its one action. Items are the admin's own notifications, so handling one here or in
 * Notifications clears both. Bypassed is a fact, not an alarm: Review opens the agents, and an admin may Acknowledge it.
 */
export function NeedsAttentionSection() {
  const noticesQuery = useQuery(getNeedsAttention, undefined, { refetchInterval: 30_000 })
  const { data: notices, refetch } = noticesQuery
  const accessQuery = useQuery(getMyModelAccess)
  const { data: access } = accessQuery
  const noticesRead = useBackgroundRead(noticesQuery, { what: 'What needs you', pollMs: 30_000 })
  const accessRead = useBackgroundRead(accessQuery, { what: 'Whether agents can answer' })
  const items = notices && (access ? [...accessItems(access), ...notices] : notices)
  const acknowledge = useAction(acknowledgeBypassedAgents)
  const dismiss = useAction(dismissNotification)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const errorDialog = useAttentionWhen(error, { kind: 'alert' })

  const run = async (key: string, work: () => Promise<unknown>) => {
    setBusy(key)
    setError('')
    try { await work(); await refetch() } catch (err) { setError(err instanceof Error ? err.message : 'That did not work') } finally { setBusy(null) }
  }

  return (
    <section aria-label="Needs attention">
      <OrgGroupHeading
        title={`Needs attention${items && items.length > 0 ? ` · ${items.length}` : ''}`}
        aside="Clears itself when handled"
      />
      <div className="rounded-2xl border border-border-subtle bg-surface-1 px-4 py-1.5">
        {!items ? (
          noticesRead.failedWithoutData ? noticesRead.nudge : <p className="py-3 text-small text-text-muted">Loading…</p>
        ) : items.length === 0 ? (
          <p className="py-3 text-body text-text-secondary">Nothing needs you.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {items.map(item => (
              <li key={item.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-64">
                  <div className={`text-body font-medium ${item.area === 'infrastructure' ? 'text-warning' : 'text-text-primary'}`}>{item.title}</div>
                  {item.body && <div className="text-small text-text-muted">{item.body}</div>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {item.actionUrl && item.actionLabel && (
                    <Link to={item.actionUrl} className={ACTION}>{item.actionLabel}</Link>
                  )}
                  {item.acknowledgeable && (
                    <button type="button" disabled={busy === item.key} className={ACTION} onClick={() => void run(item.key, () => acknowledge(undefined))}>Acknowledge</button>
                  )}
                  {item.dismissible && item.notificationIds.length === 1 && (
                    <button type="button" disabled={busy === item.key} className={ACTION} onClick={() => void run(item.key, () => dismiss({ id: item.notificationIds[0] }))}>Dismiss</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {noticesRead.failedWithoutData ? null : noticesRead.nudge}
      {accessRead.failedWithoutData ? (
        <ReadFailedLine error={accessQuery.error} what="Whether agents can answer" retry={() => void accessQuery.refetch()} />
      ) : accessRead.nudge}
      {errorDialog}
    </section>
  )
}
