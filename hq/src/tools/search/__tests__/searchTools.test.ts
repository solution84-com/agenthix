/**
 * The tool index (lean agent context spec, §7): entries embedded once by the hash of their text, scored by meaning
 * plus words, the best few above a bar, and words alone when the model fails or is slow. On the platform's real tool
 * texts: by words alone, and by meaning with hq's built-in model where its files are on disk (HQ_BUNDLED_MODELS_DIR,
 * as hq's image sets it; never fetched), on which the bar was tuned.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { Embedder } from '../../../memory/contract'
import path from 'node:path'
import { createFakeEmbedder } from '../../../test/fakes/embedders'
import { createLocalEmbedder } from '../../../memory/embedding/localEmbedder'
import { LOCAL_EMBEDDING_MODEL } from '../../../memory/embedding/localModelManifest'
import { holdsModel } from '../../../memory/embedding/localModelFiles'
import { CONTROL_PLANE_TOOLS } from '../../../server/controlplane/toolSchemas'
import { LEAN_TOOLS } from '../../../conversations/tools/leanTaskTools'
import { MEANING_BAR, entryText, forgetVectors, searchTools, type ToolEntry } from '..'

/** What a conversation finds by search, of the control plane's tools (the built-in agent's defaults). */
const FOLDED = new Set([
  'get_org', 'list_agents', 'list_teams', 'list_projects', 'attach_file', 'list_milestones',
  'create_milestone', 'update_milestone', 'change_tasks', 'list_boards', 'get_board', 'rename_sprint', 'add_comment',
  'list_active_runs', 'list_products', 'get_product', 'open_board',
])

/** Those tools and the conversation's plan_task, as the index is given them. */
const ENTRIES: ToolEntry[] = [
  ...CONTROL_PLANE_TOOLS.filter(t => FOLDED.has(t.name)).map(t => ({
    name: t.name, area: t.area, description: t.description ?? t.name, input: z.toJSONSchema(z.object(t.schema)),
  })),
  ...LEAN_TOOLS.map(t => ({ name: t.name, area: t.area, description: t.description, input: z.toJSONSchema(z.object(t.schema)) })),
]

/** Every control-plane tool, as a run's search may be given them. */
const EVERY: ToolEntry[] = CONTROL_PLANE_TOOLS.map(t => ({ name: t.name, area: t.area, description: t.description ?? t.name, input: z.toJSONSchema(z.object(t.schema)) }))

const names = async (query: string, embedder: Embedder | null) => (await searchTools(query, ENTRIES, { embedder })).map(t => t.name)

const bundled = process.env.HQ_BUNDLED_MODELS_DIR
const held = bundled ? await holdsModel(path.join(bundled, LOCAL_EMBEDDING_MODEL.name), LOCAL_EMBEDDING_MODEL) : false
const real = held ? createLocalEmbedder() : null

beforeEach(() => forgetVectors())

describe('an entry @SC-2172', () => {
  it("is the name in words, the description's first sentence and the input's names", () => {
    const entry = { name: 'add_comment', description: 'Comment on a task. Seen by everyone.', input: { properties: { taskId: {}, content: {} } } }
    expect(entryText(entry)).toBe('add comment. Comment on a task.. task id, content')
  })
})

describe('the search @SC-2172', () => {
  for (const [label, embedder] of [['by meaning and words, on hq\'s built-in model', () => real], ['by words alone', () => null]] as const) {
    describe.skipIf(label !== 'by words alone' && !real)(label, () => {
      it("finds plan_task and list_milestones for a task's milestone", async () => {
        const found = await names("set a task's milestone", embedder())
        expect(found).toEqual(expect.arrayContaining(['plan_task', 'list_milestones']))
      })

      it('finds add_comment first for a comment on a task', async () => {
        expect((await names('comment on a task', embedder()))[0]).toBe('add_comment')
      })

      it('finds list_boards for what boards there are', async () => {
        expect(await names('what boards', embedder())).toContain('list_boards')
      })

      it('ranks a tool named in the query first', async () => {
        expect((await names('use plan_task', embedder()))[0]).toBe('plan_task')
      })

      it('answers nothing for what no tool does, and at most five', async () => {
        expect(await names('order a pizza', embedder())).toEqual([])
        expect((await names('task', embedder())).length).toBeLessThanOrEqual(5)
      })
    })
  }

  it.skipIf(!real)('finds nothing for a comment when add_comment is at Never: what only resembles the ask is below the bar', async () => {
    const without = ENTRIES.filter(e => e.name !== 'add_comment')
    for (const ask of ['add a comment to a task', 'comment on task', 'comments on tasks']) {
      expect(await searchTools(ask, without, { embedder: real })).toEqual([])
    }
  })

  it('answers each found tool with its full description and input', async () => {
    const [found] = await searchTools('comment on a task', ENTRIES, { embedder: null })
    const declared = ENTRIES.find(e => e.name === 'add_comment')!
    expect(found).toEqual({ name: 'add_comment', description: declared.description, input: declared.input })
  })

  it('finds add_comment first by words among every control-plane tool', async () => {
    expect((await searchTools('comment on a task', EVERY, { embedder: null }))[0]!.name).toBe('add_comment')
  })

  it('searches only the entries it is given', async () => {
    const without = ENTRIES.filter(e => e.name !== 'add_comment')
    expect((await searchTools('comment on a task', without, { embedder: null })).map(t => t.name)).not.toContain('add_comment')
  })
})

describe('the bar by meaning @SC-2172', () => {
  it('finds nothing that only resembles the ask: a match of 0.65 is not found', async () => {
    // Every entry sits at a cosine of 0.65 to the query, as tools that don't do an ask did on hq's built-in model.
    const resembling: Embedder = {
      model: 'resembling', dimensions: 2,
      embed: async texts => texts.map(t => (t === 'zzqx wibble' ? [1, 0] : [0.65, Math.sqrt(1 - 0.65 ** 2)])),
    }
    expect(MEANING_BAR).toBeGreaterThan(0.65)
    expect(await names('zzqx wibble', resembling)).toEqual([])
  })
})

describe('the vectors @SC-2172', () => {
  it('are embedded once per text, and again only for a text that changed', async () => {
    const embedder = createFakeEmbedder()
    await searchTools('what boards', ENTRIES, { embedder })
    await searchTools('comment on a task', ENTRIES, { embedder })
    const entryCalls = embedder.calls.filter(c => c.length > 1)
    expect(entryCalls).toHaveLength(1)
    expect(entryCalls[0]).toHaveLength(ENTRIES.length)

    const changed = ENTRIES.map(e => (e.name === 'add_comment' ? { ...e, description: 'Write a note on a task.' } : e))
    await searchTools('comment on a task', changed, { embedder })
    expect(embedder.calls.at(-1)).toEqual(['add comment. Write a note on a task.. task id, run id, content'])
  })
})

describe('without the model @SC-2172', () => {
  it('searches by words when the model fails to load, and tries it again next time', async () => {
    let fails = true
    const fake = createFakeEmbedder()
    const flaky: Embedder = { model: 'local', dimensions: fake.dimensions, embed: async texts => { if (fails) throw new Error('no model'); return fake.embed(texts) } }
    expect(await searchTools('comment on a task', ENTRIES, { embedder: flaky })).toEqual(await searchTools('comment on a task', ENTRIES, { embedder: null }))
    fails = false
    await searchTools('comment on a task', ENTRIES, { embedder: flaky })
    expect(fake.calls.some(c => c.length === ENTRIES.length)).toBe(true)
  })

  it('searches by words when the model is slower than the wait', async () => {
    const slow: Embedder = { model: 'local', dimensions: 384, embed: () => new Promise(() => {}) }
    const found = await searchTools('comment on a task', ENTRIES, { embedder: slow, waitMs: 5 })
    expect(found.map(t => t.name)[0]).toBe('add_comment')
  })
})
