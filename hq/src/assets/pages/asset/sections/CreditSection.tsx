import { useState } from 'react'
import { useAction, useQuery, getAssetCredit, addAssetCredit } from 'wasp/client/operations'
import { Section, SMALL_BUTTON } from '../../../components/Section'
import { useAttention } from '../../../../shared/components/AttentionDialog'
import { messageOf } from '../../../components/messageOf'
import type { AssetPageView } from '../pageTypes'
import { FIELD as FIELD_LOOK, BUTTON_SECONDARY } from '@agenthix/ui/primitives'

/**
 * *Credit* (D19): what the asset is based on, written once when the copy was made. *Verified* where hq matched the
 * original's fingerprint, *stated* otherwise. The licence travels with it. People can only add a credit (stated);
 * no line can be edited or removed here.
 */
export function CreditSection({ page }: { page: AssetPageView }) {
  const { data, refetch } = useQuery(getAssetCredit, { assetId: page.assetId })
  const add = useAction(addAssetCredit)
  const [open, setOpen] = useState(false)
  const [skill, setSkill] = useState('')
  const [version, setVersion] = useState('')
  const attention = useAttention()
  const may = page.can.edit && page.own

  const save = async (): Promise<void> => {
    try {
      await add({ assetId: page.assetId, skill, version: version || undefined })
      setSkill(''); setVersion(''); setOpen(false)
      await refetch()
    } catch (err) {
      attention.show({ title: 'The credit was not added', text: messageOf(err), retry: () => void save() })
    }
  }
  const lines = data?.lines ?? []
  return (
    <Section title="Credit" count={lines.length} testId="asset-credit">
      {lines.length === 0 && data && <p className="text-small text-text-secondary">It isn't based on anything else.</p>}
      <ul className="space-y-1.5">
        {lines.map((l, i) => (
          <li key={`${l.skill}:${i}`} className="text-body text-text-primary">
            Based on {l.skill}{l.version ? ` ${l.version}` : ''}, copied {l.copied}
            {' · '}
            <span className={`text-small font-medium ${l.shown === 'verified' ? 'text-success' : 'text-text-secondary'}`}>{l.shown === 'verified' ? '✓ verified' : l.statedBy ? `stated by ${l.statedBy}` : 'stated'}</span>
          </li>
        ))}
      </ul>
      {data?.licence && <p className="mt-2 text-small text-text-secondary">Licence: {data.licence}</p>}
      {may && !open && <button type="button" onClick={() => setOpen(true)} className={`${SMALL_BUTTON} mt-3`}>＋ Add a credit</button>}
      {open && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="text-small text-text-secondary">What it is based on
            <input value={skill} onChange={e => setSkill(e.target.value)} placeholder="blog.example.com/review-checklist" className={`mt-1 block w-72 rounded-lg px-2 py-1 text-body ${FIELD_LOOK}`} />
          </label>
          <label className="text-small text-text-secondary">Version (optional)
            <input value={version} onChange={e => setVersion(e.target.value)} className={`mt-1 block w-28 rounded-lg px-2 py-1 text-body ${FIELD_LOOK}`} />
          </label>
          <button type="button" disabled={!skill.trim()} onClick={() => void save()} className={SMALL_BUTTON}>Add</button>
          <button type="button" onClick={() => setOpen(false)} className={`rounded-lg px-2.5 py-1 text-small ${BUTTON_SECONDARY}`}>Cancel</button>
        </div>
      )}
      <p className="mt-2 text-micro text-text-muted">A credit you add is stated: HQ has not checked it. Nothing here can be edited or removed.</p>
      {attention.dialog}
    </Section>
  )
}
