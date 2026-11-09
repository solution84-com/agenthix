#!/usr/bin/env node
/**
 * Regenerates src/models/openCodeModels.generated.ts from the model catalogue
 * of the pinned OpenCode version. Run by hand whenever OpenCode is upgraded,
 * with the upgrade checks the design requires, and commit the result.
 *
 *   docker run --rm --network none --entrypoint cat agenthix-agent:latest \
 *     /usr/local/lib/agenthix/opencode/models.json > models.json
 *   node scripts/generate-model-list.mjs models.json <opencode version>
 *
 * The catalogue file is the one site/docker/opencode/extract-models.mjs
 * extracts from OpenCode's binary, so the picker and the image read one
 * catalogue. Only the providers Agenthix offers with a catalogue are kept
 * (an OpenAI-compatible endpoint has none; its model is typed), and only
 * models an agent can use: they call tools, answer in text, are not deprecated,
 * and have a price to rank by.
 *
 * The Claude runtime's list is the `anthropic` entries of the same catalogue
 * with the provider prefix dropped, since the Claude CLI takes bare ids. A dated
 * id (`…-20251001`) is dropped when the undated alias of the same model is in
 * the catalogue: the alias is what the CLI resolves to it, and listing both shows
 * the same model twice. Its label loses the catalogue's " (latest)".
 *
 * The price table holds each listed model's dollars per million tokens (input,
 * output, cache read, cache write; 0 where the catalogue has none), keyed by the
 * model's value in either list, plus every bare Anthropic id (dated ones too, so
 * a run recorded on one still has a price). The usage displays read it.
 *
 * The image-input list names each listed model (by its value in either list,
 * as the price table) whose catalogue entry takes images among its inputs; a
 * listed model not in it reads text only. A conversation gives a picture to
 * the models in it, and says so before sending to one known to read text only.
 *
 * Each listed model keeps the catalogue's `release_date` (YYYY-MM-DD) as
 * `releasedAt`, which the newest-of-a-family helper orders by; a model without
 * a valid date has none.
 *
 * A model's cost rank orders the models by price per million tokens (input
 * plus output), lowest first. Free models rank 0; models with the same price
 * share a rank; ranks are consecutive.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Price bands of a model (input plus output, dollars per million tokens), sized
// so Anthropic's tiers fall in three bands: Haiku in the first, Sonnet in the
// second, Opus and above in the third. Free is rank 0.
const LOW_BAND_MAX_PRICE = 8
const MID_BAND_MAX_PRICE = 25

const PROVIDERS = ['openrouter', 'openai', 'google', 'anthropic']

const [cataloguePath, version] = process.argv.slice(2)
if (!cataloguePath || !/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('usage: generate-model-list.mjs <models.json> <opencode version>')
  process.exit(1)
}

const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'))

const entries = []
for (const provider of PROVIDERS) {
  if (!catalogue[provider]) throw new Error(`the catalogue has no ${provider}`)
  const models = Object.values(catalogue[provider].models)
    .filter(m =>
      m.tool_call === true &&
      m.status !== 'deprecated' &&
      m.modalities?.output?.includes('text') &&
      Number.isFinite(m.cost?.input) &&
      Number.isFinite(m.cost?.output))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  for (const m of models) {
    entries.push({
      provider, id: m.id, label: m.name.replace(/\s+/g, ' ').trim(), price: m.cost.input + m.cost.output, cost: m.cost,
      images: m.modalities?.input?.includes('image') === true,
      releasedAt: /^\d{4}-\d{2}-\d{2}$/.test(m.release_date ?? '') ? m.release_date : null,
    })
  }
}

const prices = [...new Set(entries.map(e => e.price))].filter(p => p > 0).sort((a, b) => a - b)
const rankOf = price => (price === 0 ? 0 : prices.indexOf(price) + 1)

const bandMaxRank = limit => Math.max(0, ...prices.filter(p => p <= limit).map(p => rankOf(p)))

const dated = /-\d{8}$/
const anthropicIds = new Set(entries.filter(e => e.provider === 'anthropic').map(e => e.id))
const dateField = e => (e.releasedAt ? `, releasedAt: ${JSON.stringify(e.releasedAt)}` : '')
const claudeLines = entries
  .filter(e => e.provider === 'anthropic' && !(dated.test(e.id) && anthropicIds.has(e.id.replace(dated, ''))))
  .map(e => `  { value: ${JSON.stringify(e.id)}, label: ${JSON.stringify(e.label.replace(/ \(latest\)$/, ''))}, costRank: ${rankOf(e.price)}${dateField(e)} },`)

const num = n => (Number.isFinite(n) ? n : 0)
const priceRow = c => `[${num(c.input)}, ${num(c.output)}, ${num(c.cache_read)}, ${num(c.cache_write)}]`
const priceLines = entries.flatMap(e => {
  const row = priceRow(e.cost)
  const rows = [`  ${JSON.stringify(`${e.provider}/${e.id}`)}: ${row},`]
  if (e.provider === 'anthropic') rows.push(`  ${JSON.stringify(e.id)}: ${row},`)
  return rows
})

const imageLines = entries.filter(e => e.images).flatMap(e => {
  const rows = [`  ${JSON.stringify(`${e.provider}/${e.id}`)},`]
  if (e.provider === 'anthropic') rows.push(`  ${JSON.stringify(e.id)},`)
  return rows
})

const lines = entries.map(e =>
  `  { value: ${JSON.stringify(`${e.provider}/${e.id}`)}, label: ${JSON.stringify(e.label)}, provider: ${JSON.stringify(e.provider)}, costRank: ${rankOf(e.price)}${dateField(e)} },`)

const out = `// Generated by core/scripts/generate-model-list.mjs from the model catalogue of
// OpenCode ${version}. Do not edit by hand; regenerate when OpenCode is upgraded.
import type { ModelPreset, OpenCodeModel } from './modelList.js'

export const OPENCODE_CATALOGUE_VERSION = '${version}'

/** The highest cost rank of the low and of the middle price band; above the middle is the top band. */
export const COST_BAND_MAX_RANKS = { low: ${bandMaxRank(LOW_BAND_MAX_PRICE)}, mid: ${bandMaxRank(MID_BAND_MAX_PRICE)} }

export const CLAUDE_SDK_MODELS: readonly ModelPreset[] = [
${claudeLines.join('\n')}
]

/** Dollars per million tokens: input, output, cache read, cache write. */
export const MODEL_PRICE_TABLE: Readonly<Record<string, readonly [number, number, number, number]>> = {
${priceLines.join('\n')}
}

/** The listed models that take images among their inputs, keyed as the price table is; any other listed model reads text only. */
export const IMAGE_INPUT_MODELS: ReadonlySet<string> = new Set([
${imageLines.join('\n')}
])

export const OPENCODE_MODELS: readonly OpenCodeModel[] = [
${lines.join('\n')}
]
`
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/models/openCodeModels.generated.ts')
fs.writeFileSync(target, out)
console.log(`${claudeLines.length} Claude models, ${entries.length} models, ${prices.length} paid price levels -> ${target}`)
