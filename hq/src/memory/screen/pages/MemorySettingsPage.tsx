import { useState } from 'react'
import { useQuery, useAction, getMemoryMeasurements, setMemoryEmbeddingModel } from 'wasp/client/operations'
import { OrgAdminHeading, OrgAdminPage } from '../../../org/pages/OrgAdminPage'
import { reliedOnShare } from './memoryFormat'

const LOCAL = 'local'
const FIELD = 'bg-surface-2 border border-border rounded-lg px-3 py-2 text-body text-text-primary'

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-surface-1 border border-border rounded-xl p-4">
      <div className="text-h2 font-semibold text-text-primary">{value}</div>
      <div className="text-small text-text-secondary">{label}</div>
    </div>
  )
}

/** Organisation › Settings › Memory: how recall has done over the last 30 days, and the model that reads memory. */
export function MemorySettingsPage() {
  const { data: m } = useQuery(getMemoryMeasurements)
  const setModel = useAction(setMemoryEmbeddingModel)
  const [model, setModelText] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const share = m ? reliedOnShare(m) : null

  async function switchTo(next: string) {
    setProblem(null)
    try {
      await setModel({ model: next })
      setModelText(null)
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <OrgAdminPage area="settings" title="Memory">
      <OrgAdminHeading title="Memory">How well agents remember, and the model that reads what they remember.</OrgAdminHeading>
      {!m ? <p className="text-body text-text-muted">Loading…</p> : (
        <>
          <section aria-labelledby="memory-recall" className="mb-8">
            <h2 id="memory-recall" className="text-h3 font-semibold text-text-primary">Recall, last 30 days</h2>
            <p className="mt-0.5 mb-4 text-small text-text-secondary">
              {share === null ? 'Nothing has been judged yet.' : `Agents relied on ${share}% of the memories they were given.`}
              {` Recall tuning: certain at ${m.certainBar}, probable at ${m.probableBar}.`}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Figure label="Included in a reply" value={m.included} />
              <Figure label="Named as a hint" value={m.hinted} />
              <Figure label="Recalled on request" value={m.recalled} />
              <Figure label="Relied on" value={m.used} />
              <Figure label="Not relied on" value={m.unused} />
              <Figure label="Missed" value={m.missed} />
            </div>
          </section>

          <section aria-labelledby="memory-model">
            <h2 id="memory-model" className="text-h3 font-semibold text-text-primary">Embedding model</h2>
            <p className="mt-0.5 mb-4 text-small text-text-secondary">
              Memory is found by meaning with this model. Switching reads every memory again in the background; the old
              one keeps serving until it is done.
            </p>
            <p className="text-body text-text-primary">
              In use: <strong>{m.embeddingModel === LOCAL ? 'The model that runs inside HQ' : m.embeddingModel}</strong>
            </p>
            {m.reembedding && (
              <p role="status" className="mt-2 text-small text-text-secondary">
                Moving to {m.reembedding.to}: {m.reembedding.done} of {m.reembedding.total} memories done.
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <input aria-label="Embedding model" value={model ?? ''} placeholder="openai/text-embedding-3-small"
                onChange={e => setModelText(e.target.value)} className={`${FIELD} flex-1 min-w-60`} />
              <button type="button" disabled={!model?.trim()} onClick={() => switchTo(model!.trim())}
                className="bg-accent hover:bg-accent/90 disabled:opacity-50 text-on-accent px-4 py-2 rounded-lg text-body font-medium cursor-pointer">Switch</button>
              {(m.embeddingModel !== LOCAL || m.reembedding) && (
                <button type="button" onClick={() => switchTo(m.reembedding ? m.embeddingModel : LOCAL)}
                  className="px-4 py-2 rounded-lg text-body text-text-secondary hover:text-text-primary cursor-pointer">
                  {m.reembedding ? 'Stop switching' : 'Use the model inside HQ'}
                </button>
              )}
            </div>
            {problem && <p role="alert" className="mt-2 text-small text-danger">{problem}</p>}
          </section>
        </>
      )}
    </OrgAdminPage>
  )
}
