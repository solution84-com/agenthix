// Knowledge searched across levels, from a conversation, with hq and its site running (agent knowledge spec, part 6,
// V5 and V7): pages a person saves at a project, at the organisation, and the platform guide hq holds. The lead of a
// conversation in that project searches with search_knowledge: hq asks the site for the project's and the
// organisation's pages over the channel and greps its own guide, and the answer marks every page with its level, the
// most specific first (the place, then the organisation, then the guide). A project the person is in but has not added
// to the conversation is out of reach — named in the answer as not searched, never as empty — until the person adds it.
//
// The model is the stand-in vendor (harness/fakeVendor.ts), scripted to call the tool the person's message names, so
// what the lead's tool answered is what the vendor is sent back. No real model is called.
//
// Runs after 06-model-usage on the pair 04-pairing left, or alone (`npx vitest run 07-knowledge-levels`), pairing its
// own default site first.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HQ_URL } from './harness/env'
import { hqDb } from './harness/db'
import { login, op, until } from './harness/hqApi'
import { FAKE_KEY, FAKE_MODEL, FakeVendor, type ChatRequest, type ScriptedAnswer } from './harness/fakeVendor'
import { buildPlatformGuide, ensureDefaultSite } from './harness/knowledgeSetup'

const MARK = `levelmark${Date.now().toString(36)}`
// The place's and the organisation's pages hold the mark; the guide's tools reference names search_knowledge.
const PATTERN = `${MARK}|search_knowledge`
const SEARCH_TAG = /<<search:(\d+):(\{.*?\})>>/g

let vendor: FakeVendor
let adminToken: string
let conversationId: string
let here: { id: string; slug: string }
let elsewhere: { id: string; slug: string }
/** What search_knowledge answered, by the number of the person's message that asked for it. */
const answered = new Map<number, string>()

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map(p => (p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '')).join('')
  return ''
}

/** Every string in a value, in order: a result sent as JSON, whether it is the text itself or an object holding it. */
function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(stringsIn)
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn)
  return []
}

/** A tool result as the lead's tool gave it, read out of the JSON it was sent to the model in. */
function resultText(content: unknown): string {
  const raw = textOf(content)
  try {
    return stringsIn(JSON.parse(raw) as unknown).join('\n')
  } catch {
    return raw
  }
}

/**
 * The lead's model: the newest message of the person's that names a search is answered with that call of
 * search_knowledge, and once its result is back, with a line of text, keeping the result.
 */
function script(request: ChatRequest): ScriptedAnswer | null {
  if (!request.tools?.some(t => t.function?.name === 'search_knowledge')) return null
  const messages = request.messages ?? []
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'user') continue
    const tags = [...textOf(messages[i].content).matchAll(SEARCH_TAG)]
    if (!tags.length) continue
    const [, n, args] = tags[tags.length - 1]
    const result = messages.slice(i + 1).find(m => m.role === 'tool')
    if (result) {
      answered.set(Number(n), resultText(result.content))
      return { text: 'Noted.' }
    }
    return { toolCall: { name: 'search_knowledge', args: JSON.parse(args) as Record<string, unknown> } }
  }
  return null
}

let asked = 0
/** The person asks for one search; resolves to what search_knowledge answered the lead. */
async function search(args: Record<string, unknown>): Promise<string> {
  const n = ++asked
  const text = `Please search. <<search:${n}:${JSON.stringify(args)}>>`
  const clientMessageId = `knowledge-levels-${n}-${Date.now()}`
  if (!conversationId) {
    const started = await op(HQ_URL, 'start-conversation', { home: 'PROJECT', projectId: here.id, clientMessageId, text }, adminToken)
    expect(started.status, JSON.stringify(started.json)).toBe(200)
    conversationId = started.json.conversationId
  } else {
    const sent = await op(HQ_URL, 'send-conversation-message', { conversationId, clientMessageId, text }, adminToken)
    expect(sent.status, JSON.stringify(sent.json)).toBe(200)
  }
  return until(async () => answered.get(n), `search_knowledge's answer to message ${n}`, 120_000)
}

async function project(name: string): Promise<{ id: string; slug: string }> {
  const made = await op(HQ_URL, 'create-project', { name }, adminToken)
  expect(made.status, JSON.stringify(made.json)).toBe(200)
  const row = await hqDb.project.findUniqueOrThrow({ where: { id: made.json.id }, select: { id: true, slug: true } })
  return { id: row.id, slug: row.slug }
}

async function savePage(owner: Record<string, string>, page: string, title: string): Promise<void> {
  const content = `---\ntitle: ${title}\ndescription: Where ${title.toLowerCase()} is written down.\n---\n\n${MARK} is how ${title.toLowerCase()} works.\n`
  const saved = await op(HQ_URL, 'save-knowledge-page', { owner, page, content, baseVersion: null }, adminToken)
  expect(saved.status, JSON.stringify(saved.json)).toBe(200)
  expect(saved.json.outcome, JSON.stringify(saved.json)).toBe('done')
}

beforeAll(async () => {
  await ensureDefaultSite()
  buildPlatformGuide()
  vendor = await FakeVendor.start()
  vendor.script = script
  adminToken = await login('e2e-admin', 'E2eAdmin!2026')

  // An organisation holds one own endpoint, and an earlier file (06) leaves its stand-in in place.
  await hqDb.aiProvider.deleteMany({ where: { vendor: 'openai_compatible', ownerUserId: null } })
  const added = await op(HQ_URL, 'add-ai-provider', {
    vendor: 'openai_compatible', key: FAKE_KEY, name: 'Knowledge stand-in', baseUrl: vendor.baseUrl,
  }, adminToken)
  expect(added.status, JSON.stringify(added.json)).toBe(200)
  const providerId = added.json.provider.id
  const defaults = await op(HQ_URL, 'set-model-defaults', {
    conversation: `${providerId}/${FAKE_MODEL}`,
  }, adminToken)
  expect(defaults.status, JSON.stringify(defaults.json)).toBe(200)

  const agent = await op(HQ_URL, 'create-agent', { name: 'Cross-App Knowledge Agent', handle: 'crossapp-knowledge' }, adminToken)
  expect(agent.status, JSON.stringify(agent.json)).toBe(200)
  const stamp = Date.now().toString(36)
  here = await project(`Knowledge Here ${stamp}`)
  elsewhere = await project(`Knowledge Elsewhere ${stamp}`)
  await hqDb.projectAgent.create({ data: { projectId: here.id, agentId: agent.json.id } })

  await savePage({ ownerType: 'project', ownerId: here.id }, 'processes/levels.md', 'Releases')
  await savePage({ ownerType: 'org' }, 'how-we-work/levels.md', 'Reviews')
  await savePage({ ownerType: 'project', ownerId: elsewhere.id }, 'notes/levels.md', 'Pricing')
}, 600_000)

afterAll(async () => {
  await vendor?.close()
})

describe("a conversation's search across levels @SC-1444", () => {
  it('reaches the project, the organisation and the guide, each page marked with its level, most specific first', async () => {
    const text = await search({ pattern: PATTERN, output_mode: 'files_with_matches' })

    const place = text.indexOf(`${here.slug}:processes/levels.md`)
    const org = text.indexOf('org:how-we-work/levels.md')
    const guide = text.indexOf('platform:tools.md')
    expect(place, text).toBeGreaterThanOrEqual(0)
    expect(org, text).toBeGreaterThan(place)
    expect(guide, text).toBeGreaterThan(org)
    // The guide's hits open with what it is about, and every line of a hit names its level.
    expect(text.indexOf('[platform: This describes'), text).toBeGreaterThan(org)
    const hits = text.split('\n').filter(l => l.endsWith('.md'))
    for (const hit of hits) expect(hit, text).toMatch(new RegExp(`^(${here.slug}|org|platform):`))
    expect(text).toContain(`[Searched ${here.slug}:, the organisation (org:) and the platform guide (platform:).]`)
    // A project the person is in, but has not added to this conversation, is not searched.
    expect(text).not.toContain(elsewhere.slug)
    expect(text).not.toContain('notes/levels.md')
  })
})

describe('a place the conversation lacks is out of reach until the person adds it @SC-1444', () => {
  it('refuses a search scoped to it, as not searched rather than empty, giving nothing of it', async () => {
    const text = await search({ pattern: MARK, scope: elsewhere.slug, output_mode: 'files_with_matches' })
    expect(text).toContain(`"${elsewhere.slug}" is not among this conversation's places, so it was not searched`)
    expect(text).toContain('suggest_place')
    expect(text).not.toContain('notes/levels.md')
  })

  it('reaches it once the person adds it to the conversation', async () => {
    const added = await op(HQ_URL, 'add-conversation-place', { conversationId, place: { kind: 'project', projectId: elsewhere.id } }, adminToken)
    expect(added.status, JSON.stringify(added.json)).toBe(200)
    const text = await search({ pattern: MARK, scope: elsewhere.slug, output_mode: 'files_with_matches' })
    expect(text).toContain(`${elsewhere.slug}:notes/levels.md`)
  })
})
