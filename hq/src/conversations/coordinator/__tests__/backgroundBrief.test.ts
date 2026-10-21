import { describe, it, expect } from 'vitest'
import { TITLE_MAX, backgroundBrief, backgroundTitle } from '../backgroundBrief'
import type { StepCall } from '../replySteps'

const place = { key: 'personal', words: "the person's own space" }
const step = (name: string, outcome: StepCall['outcome'], input: unknown = {}, title?: string): StepCall =>
  ({ call: { id: name, name, input }, outcome, ...(title ? { title } : {}) })

describe("the brief hq writes for a long reply's rest @SC-967", () => {
  it("starts with the person's words exactly as they wrote them, and names the one place to work in", () => {
    const asked = ['Find the stale tasks in WAL,\n  and   tell me who owns each.', 'Also the archived ones.']
    const brief = backgroundBrief({ asked, found: [], place })
    expect(brief.startsWith(`What they asked, word for word:\n\n${asked[0]}\n\n${asked[1]}\n`)).toBe(true)
    expect(brief).toContain("Work only in the person's own space.")
    expect(brief).toContain('another place you cannot')
  })

  it('lists what was started or changed, what was looked up, and what was refused, apart', () => {
    const brief = backgroundBrief({
      asked: ['Go'],
      place,
      found: [
        step('list_projects', { status: 'done', operationId: 'o1', result: { projects: ['WAL'] } }),
        step('create_task', { status: 'done', operationId: 'o2', result: { id: 't1' } }, { title: 'Morning check' }),
        step('start_work', { status: 'accepted', operationId: 'o3' }, { boundary: 'WAL' }, 'Tidy WAL'),
        step('run_task', { status: 'waitingApproval', operationId: 'o4' }, { taskId: 'WAL-2' }),
        step('get_task_details', { status: 'refused', reason: 'Task WAL-9 not found' }, { taskId: 'WAL-9' }),
        step('used_memory', { status: 'done', operationId: 'o5', result: {} }),
      ],
    })
    const [, changed, lookedUp, refused] = brief.split(/\n\nWhat (?:you already|was refused)/)
    expect(changed).toContain('create_task {"title":"Morning check"} → {"id":"t1"}')
    expect(changed).toContain('start_work {"boundary":"WAL"} → started ("Tidy WAL"), still going')
    expect(changed).toContain('run_task {"taskId":"WAL-2"} → waiting for the person\'s okay')
    expect(lookedUp).toContain('list_projects {} → {"projects":["WAL"]}')
    expect(refused).toContain('get_task_details {"taskId":"WAL-9"} → refused: Task WAL-9 not found')
    expect(brief).not.toContain('used_memory')
  })

  it('caps each result, and counts what does not fit rather than cutting a line', () => {
    const big = { rows: 'x'.repeat(5_000) }
    const found = Array.from({ length: 20 }, (_, i) => step('list_tasks', { status: 'done', operationId: `o${i}`, result: big }, { i }))
    const brief = backgroundBrief({ asked: ['Go'], place, found })
    const lines = brief.split('\n').filter(l => l.startsWith('- list_tasks'))
    expect(lines.every(l => l.length < 1_900)).toBe(true)
    expect(lines.length).toBeLessThan(20)
    expect(brief).toContain(`- (and ${20 - lines.length} more, left out for length)`)
  })
})

describe("the work's title @SC-967", () => {
  it("is the person's first line, capped", () => {
    expect(backgroundTitle(['  Create a task in WAL\nand start it tomorrow'])).toBe('Create a task in WAL')
    expect(backgroundTitle(['x'.repeat(200)])).toHaveLength(TITLE_MAX)
    expect(backgroundTitle(['', '  '])).toBeNull()
  })
})
