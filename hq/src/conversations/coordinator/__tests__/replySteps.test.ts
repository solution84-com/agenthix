import { describe, it, expect } from 'vitest'
import { callLabel, createStepLog, stepLine, whyInWords } from '../replySteps'

const call = (name: string, input: unknown = {}) => ({ id: 'c', name, input })
const done = (result: unknown = {}) => ({ status: 'done' as const, operationId: 'o', result })

describe('a call in words @SC-1005', () => {
  it('names what it looked at, never the tool', async () => {
    expect(await callLabel(call('list_projects'), done())).toBe('Your projects')
    expect(await callLabel(call('get_task_details', { taskId: 't1' }), done({ title: 'Write a welcome' }))).toBe('"Write a welcome"')
    expect(await callLabel(call('get_task_details', { taskId: 'wal-2' }), { status: 'refused', reason: 'x' })).toBe('WAL-2')
    expect(await callLabel(call('list_tasks', { projectId: 'p1' }), done(), { project: async () => 'Walkthrough' })).toBe("Walkthrough's tasks")
    expect(await callLabel(call('list_tasks', { projectId: 'p1' }), null, { project: async () => 'Walkthrough' })).toBe('The tasks')
  })

  it('says what a change set out to do, and what it did once it worked', async () => {
    expect(await callLabel(call('run_task', { taskId: 'WAL-2' }), null)).toBe('Run WAL-2')
    expect(await callLabel(call('run_task', { taskId: 'WAL-2' }), { status: 'accepted', operationId: 'o' }, undefined, 'Write a one-line welcome')).toBe('Started "Write a one-line welcome"')
    expect(await callLabel(call('create_task', { title: 'Tidy' }), done())).toBe('Created "Tidy"')
    expect(await callLabel(call('start_work', { title: 'Survey' }), { status: 'waitingApproval', operationId: 'o' })).toBe('Start "Survey" — waiting for your okay')
  })

  it('falls back to plain words for a tool it has none for', async () => {
    expect(await callLabel(call('list_workforce_templates'), done())).toBe('The team templates')
    expect(await callLabel(call('some_new_tool'), done())).toBe('Some new tool')
  })

  it('gives a refusal in a few words, with no tool name in them', () => {
    expect(whyInWords('Task WAL-2 not found')).toBe('not found by that name')
    expect(whyInWords('list_tasks is outside this turn\'s project scope')).toBe('not allowed here')
    expect(whyInWords('update_task needs a person\'s approval first: ask for it with a reason')).toBe('needs your okay')
    expect(whyInWords('boom')).toBe("didn't work")
  })
})

describe("a step's line @SC-1005", () => {
  it('joins its calls, and is failed only when none worked', async () => {
    const line = await stepLine([
      { call: call('list_projects'), outcome: done() },
      { call: call('list_boards'), outcome: done() },
      { call: call('run_task', { taskId: 'WAL-2' }), outcome: { status: 'refused', reason: 'not found' } },
    ])
    expect(line).toEqual({ label: 'Your projects, The boards and Run WAL-2 — not found by that name', failed: false })
    expect((await stepLine([{ call: call('run_task', { taskId: 'WAL-2' }), outcome: { status: 'refused', reason: 'not found' } }])).failed).toBe(true)
  })
})

describe('the knowledge tools in words, and what they did kept on the step @SC-1415', () => {
  const change = {
    kind: 'knowledge_change' as const, level: 'website-rebuild', owner: { ownerType: 'project' as const, ownerId: 'p1' },
    page: 'processes/release.md', title: 'Release process', change: 'edited' as const, versionId: 'v2', previousVersionId: 'k2',
    summary: 'Now says "Mia approves"',
  }
  const knowing = (knowledge: unknown) => ({ ...done('Done.'), knowledge }) as Parameters<typeof callLabel>[1]

  it('names the page, the guide page and the places searched', async () => {
    expect(await callLabel(call('edit_knowledge', { page: 'website-rebuild:processes/release.md' }), null)).toBe('Update page · release')
    expect(await callLabel(call('edit_knowledge', { page: 'website-rebuild:processes/release.md' }), knowing(change))).toBe('Updated page · Release process')
    expect(await callLabel(call('write_knowledge', { page: 'personal:deploys.md' }), knowing({ ...change, change: 'created', title: 'How we deploy' }))).toBe('Wrote page · How we deploy')
    expect(await callLabel(call('read_knowledge', { page: 'website-rebuild:processes/release.md' }), done('1\tline'))).toBe('Read page · release')
    expect(await callLabel(call('read_knowledge', { page: 'platform:your-tools/providers.md' }), knowing({ kind: 'platform_page', page: 'your-tools/providers.md', title: 'Providers' })))
      .toBe('Looked up the guide · Providers')
    expect(await callLabel(call('search_knowledge', { pattern: 'release' }), knowing({ kind: 'knowledge_search', levels: ['website-rebuild', 'org'], names: ['Website rebuild', 'Organisation'] })))
      .toBe('Searched knowledge · Website rebuild and Organisation')
  })

  it("a change the gate refused, answered as text, says it didn't work", async () => {
    expect(await callLabel(call('edit_knowledge', { page: 'website-rebuild:processes/release.md' }), done('old_string was not found'))).toBe("Update page · release — didn't work")
  })

  const stepsOf = async (done: { call: ReturnType<typeof call>; outcome: Parameters<typeof callLabel>[1] }[]) => {
    const log = createStepLog({ from: new Date(0), now: () => new Date(1000), emit: () => {} })
    await log.begin(done.map(d => d.call), new Date(0))
    await log.finish(done as never)
    return log.thinking()?.steps
  }

  it('gives each knowledge call its own step, keeping what it did', async () => {
    expect(await stepsOf([
      { call: call('search_knowledge', { pattern: 'release' }), outcome: knowing({ kind: 'knowledge_search', levels: ['org'], names: ['Organisation'] }) },
      { call: call('edit_knowledge', { page: 'website-rebuild:processes/release.md' }), outcome: knowing(change) },
    ])).toEqual([
      { label: 'Searched knowledge · Organisation', ms: 1000, knowledge: [{ kind: 'knowledge_search', levels: ['org'], names: ['Organisation'] }] },
      { label: 'Updated page · Release process', ms: 1000, knowledge: [change] },
    ])
  })

  it('never hides another call behind a knowledge step: the rest share one line, where the first of them was asked (F11)', async () => {
    const search = { kind: 'knowledge_search', levels: ['personal', 'org', 'platform'], names: ['Your space', 'Organisation', 'Platform guide'] }
    expect(await stepsOf([
      { call: call('list_projects'), outcome: done() },
      { call: call('search_knowledge', { pattern: 'release' }), outcome: knowing(search) },
      { call: call('list_teams'), outcome: done() },
    ])).toEqual([
      { label: 'Your projects and The teams', ms: 1000 },
      { label: 'Searched knowledge · Your space, Organisation and Platform guide', ms: 1000, knowledge: [search] },
    ])
  })

  it('shows a knowledge call that answered without saying what it covered, as its own line (F11)', async () => {
    // A search scoped to a place the conversation does not hold answers in words, with no levels searched.
    expect(await stepsOf([
      { call: call('search_knowledge', { pattern: 'release', scope: 'my-org-project' }), outcome: done('my-org-project: is not one you can reach') },
      { call: call('search_knowledge', { pattern: 'deploy', scope: 'my-org-project' }), outcome: done('my-org-project: is not one you can reach') },
    ])).toEqual([
      { label: 'Searched knowledge', ms: 1000 },
      { label: 'Searched knowledge', ms: 1000 },
    ])
  })

  it('marks a refused knowledge call failed on its own line', async () => {
    expect(await stepsOf([
      { call: call('list_projects'), outcome: done() },
      { call: call('search_knowledge', { pattern: 'x' }), outcome: { status: 'refused', reason: 'search_knowledge is not available in this reply' } },
    ])).toEqual([
      { label: 'Your projects', ms: 1000 },
      { label: 'Searched knowledge — not available here', ms: 1000, failed: true },
    ])
  })
})
