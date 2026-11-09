import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ADR-0184: a default never names a model. A specific model id in non-test source is either a bug (use the family
 * helper) or on this list with its reason. Comments and documentation that only illustrate are not read.
 */
const ROOT = join(__dirname, '..', '..', '..')
const SOURCE_DIRS = ['core/src', 'hq/src', 'site/src']

/** Files that may name models by design. */
const EXEMPT_FILE = /(\.test\.tsx?|openCodeModels\.generated\.ts|priceList\.ts|modelFamilies\.ts)$|(^|\/)(__tests__|__modelchecks__|scenarios)\//

/** Specific files that name a model family on purpose, and why. */
export const ALLOWED: Record<string, string> = {
  'hq/src/conversations/long/windows.ts': 'a context window is a fact about a model family, not a choice of model',
  'hq/src/conversations/model/leastReasoning.ts': "OpenAI's least-reasoning setting is defined per GPT version",
  'hq/src/conversations/model/anthropicThinking.ts': "Anthropic's thinking rule is defined per Sonnet version",
}

const MODEL_ID = new RegExp(
  [
    String.raw`claude-(?:sonnet|opus|haiku|fable)-\d`,
    String.raw`(?:sonnet|opus|haiku|fable)-[(\d]`,
    String.raw`gpt-\d`,
    String.raw`gemini-\d`,
    // A model name carries a version or a kind (`deepseek-v4-flash`, `deepseek-chat`); a maker's slug (`deepseek-ai`) is not one.
    String.raw`deepseek[-/](?:v?\d|chat|reasoner|r\d)`,
    String.raw`(?:llama|qwen|mistral|kimi|glm|grok)-?\d`,
  ].join('|'),
  'i',
)

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (name === 'node_modules' || name === '.wasp') return []
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

const isCommentLine = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line)
const codeOf = (line: string) => line.replace(/\s\/\/.*$/, '')

describe('no fixed model id in source @SC-1860', () => {
  const found: Record<string, string[]> = {}
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const rel = relative(ROOT, file).split(sep).join('/')
      if (EXEMPT_FILE.test(rel)) continue
      const hits = readFileSync(file, 'utf8').split('\n').filter(l => !isCommentLine(l) && MODEL_ID.test(codeOf(l)))
      if (hits.length > 0) found[rel] = hits.map(h => h.trim())
    }
  }

  it('finds none outside the family table, the catalogue and the allowed files', () => {
    const unexpected = Object.fromEntries(Object.entries(found).filter(([file]) => !(file in ALLOWED)))
    expect(unexpected).toEqual({})
  })

  it('keeps the allowed list honest: every file on it still names a model', () => {
    expect(Object.keys(ALLOWED).filter(file => !(file in found))).toEqual([])
  })
})
