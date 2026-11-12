/**
 * Where the memory checks' messages land against the table Rule, measured with the real local embedding model and
 * the probe's own query, embedding text and tiers at the calibrated bars. It runs only where the model's files are
 * already on disk (HQ_BUNDLED_MODELS_DIR, as hq's image sets it): it never fetches them, and calls no other model.
 */
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { composeQuery } from '../../memory/composedQuery'
import { tiersOf } from '../../memory/tiers'
import { embeddingText } from '../../../memory/items'
import { cosine } from '../../../memory/ranking'
import { createLocalEmbedder } from '../../../memory/embedding/localEmbedder'
import { LOCAL_EMBEDDING_MODEL } from '../../../memory/embedding/localModelManifest'
import { holdsModel } from '../../../memory/embedding/localModelFiles'
import { DEFAULT_CERTAIN_BAR, DEFAULT_PROBABLE_BAR } from '../../../shared/memory/protocol'
import { HOST_QUESTION, QUOTES_IN_FILES, QUOTES_IN_KNOWLEDGE } from '../memoryChecks'
import { historyOf } from '../setup'
import { TABLE_RULE } from '../world'

const bundled = process.env.HQ_BUNDLED_MODELS_DIR
const held = bundled ? await holdsModel(path.join(bundled, LOCAL_EMBEDDING_MODEL.name), LOCAL_EMBEDDING_MODEL) : false

describe.skipIf(!held)('the table Rule against the checks\' messages, on the local model', () => {
  it('measures where each message lands against the calibrated bars', async () => {
    const embedder = createLocalEmbedder()
    const [rule] = await embedder.embed([embeddingText(TABLE_RULE)])
    const bars = { certain: DEFAULT_CERTAIN_BAR, probable: DEFAULT_PROBABLE_BAR }
    for (const message of [HOST_QUESTION, QUOTES_IN_KNOWLEDGE, QUOTES_IN_FILES]) {
      const history = historyOf({ home: 'project', message })
      const query = composeQuery(history, [history.at(-1)!.id], null)
      const [vector] = await embedder.embed([query])
      const similarity = cosine(vector!, rule!)
      const tiers = tiersOf([{ itemId: TABLE_RULE.itemId, similarity, score: similarity, kind: 'RULE' }], bars)
      const tier = tiers.certain[0]?.weighted ? 'included by the weight' : tiers.certain.length ? 'included by meaning' : 'below the hint bar'
      console.log(`${similarity.toFixed(3)} (bars ${bars.probable}/${bars.certain}, ${tier}): ${message}`)
      expect(Math.abs(similarity)).toBeLessThanOrEqual(1)
    }
  })
})
